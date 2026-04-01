import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { BridgeClientError } from "../../errors";
import { MANIFEST_FILE_NAME } from "../../manifest";
import { failCommand, jsonFlag } from "../_shared";

type PackageManagerName = "bun" | "npm" | "pnpm" | "yarn";

interface PackageManagerConfig {
  installCommand: string;
  name: PackageManagerName;
  runDevCommand: string;
}

interface PackageJsonShape {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

interface PackageTarget {
  packageJson: PackageJsonShape;
  relativeDir: string;
}

interface ServiceSuggestion {
  command: string;
  cwd?: string;
  name: string;
}

function createPackageJsonError(filePath: string, error: unknown): BridgeClientError {
  const message = error instanceof Error ? error.message : String(error);
  return new BridgeClientError({
    code: "manifest_invalid",
    details: {
      filePath,
    },
    message: `Lifecycle could not parse ${filePath}: ${message}`,
    suggestedAction: "Fix the invalid package.json content, then retry `lifecycle repo init`.",
  });
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(filePath: string): Promise<PackageJsonShape | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }

  try {
    return JSON.parse(await readFile(filePath, "utf8")) as PackageJsonShape;
  } catch (error) {
    throw createPackageJsonError(filePath, error);
  }
}

function parsePackageManagerField(
  value?: string,
): { major: number | null; name: PackageManagerName } | null {
  if (!value) {
    return null;
  }

  const [namePart = "", versionPart = ""] = value.split("@", 2);
  if (!namePart || !["bun", "npm", "pnpm", "yarn"].includes(namePart)) {
    return null;
  }

  const major = Number.parseInt(versionPart.split(".")[0] ?? "", 10);
  return {
    major: Number.isFinite(major) ? major : null,
    name: namePart as PackageManagerName,
  };
}

function packageManagerConfig(input: {
  major?: number | null;
  name: PackageManagerName;
}): PackageManagerConfig {
  switch (input.name) {
    case "bun":
      return {
        installCommand: "bun install --frozen-lockfile",
        name: "bun",
        runDevCommand: "bun run dev",
      };
    case "pnpm":
      return {
        installCommand: "pnpm install --frozen-lockfile",
        name: "pnpm",
        runDevCommand: "pnpm run dev",
      };
    case "yarn":
      return {
        installCommand:
          input.major !== undefined && input.major !== null && input.major >= 2
            ? "yarn install --immutable"
            : "yarn install --frozen-lockfile",
        name: "yarn",
        runDevCommand: "yarn dev",
      };
    case "npm":
      return {
        installCommand: "npm install",
        name: "npm",
        runDevCommand: "npm run dev",
      };
  }
}

async function detectPackageManager(repoPath: string): Promise<PackageManagerConfig | null> {
  const packageJson = await readPackageJson(path.join(repoPath, "package.json"));
  const explicitPackageManager = parsePackageManagerField(packageJson?.packageManager);
  if (explicitPackageManager) {
    return packageManagerConfig(explicitPackageManager);
  }

  const lockfileDetectors = [
    { file: "bun.lock", name: "bun" },
    { file: "bun.lockb", name: "bun" },
    { file: "pnpm-lock.yaml", name: "pnpm" },
    { file: "yarn.lock", name: "yarn" },
    { file: "package-lock.json", name: "npm" },
    { file: "npm-shrinkwrap.json", name: "npm" },
  ] as const;

  for (const detector of lockfileDetectors) {
    if (await pathExists(path.join(repoPath, detector.file))) {
      return packageManagerConfig({ name: detector.name });
    }
  }

  if (packageJson) {
    return packageManagerConfig({ name: "npm" });
  }

  return null;
}

function extractWorkspacePatterns(packageJson: PackageJsonShape | null): string[] {
  if (!packageJson?.workspaces) {
    return [];
  }

  if (Array.isArray(packageJson.workspaces)) {
    return packageJson.workspaces;
  }

  if (Array.isArray(packageJson.workspaces.packages)) {
    return packageJson.workspaces.packages;
  }

  return [];
}

async function discoverPackageTargets(repoPath: string): Promise<PackageTarget[]> {
  const targets = new Map<string, PackageTarget>();
  const rootPackageJson = await readPackageJson(path.join(repoPath, "package.json"));

  if (rootPackageJson) {
    targets.set(".", {
      packageJson: rootPackageJson,
      relativeDir: ".",
    });
  }

  for (const pattern of extractWorkspacePatterns(rootPackageJson)) {
    const normalizedPattern = pattern.replace(/\/$/, "");
    const packageJsonPattern = normalizedPattern.endsWith("package.json")
      ? normalizedPattern
      : `${normalizedPattern}/package.json`;

    const glob = new Bun.Glob(packageJsonPattern);
    for await (const match of glob.scan({ cwd: repoPath })) {
      const relativeDir = path.dirname(match).replace(/\\/g, "/");
      if (targets.has(relativeDir)) {
        continue;
      }

      const packageJson = await readPackageJson(path.join(repoPath, match));
      if (!packageJson) {
        continue;
      }

      targets.set(relativeDir, {
        packageJson,
        relativeDir,
      });
    }
  }

  return [...targets.values()].sort((left, right) =>
    left.relativeDir.localeCompare(right.relativeDir),
  );
}

function sanitizeServiceName(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  return sanitized || "app";
}

function inferServiceBaseName(target: PackageTarget): string {
  if (target.relativeDir !== ".") {
    return path.basename(target.relativeDir);
  }

  const packageName = target.packageJson.name;
  if (packageName) {
    const lastSegment = packageName.split("/").pop() ?? packageName;
    return lastSegment;
  }

  return "app";
}

function createUniqueServiceName(baseName: string, usedNames: Set<string>): string {
  let candidate = sanitizeServiceName(baseName);
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${sanitizeServiceName(baseName)}-${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

async function inferServiceSuggestions(
  repoPath: string,
  packageManager: PackageManagerConfig | null,
): Promise<ServiceSuggestion[]> {
  if (!packageManager) {
    return [];
  }

  const targets = await discoverPackageTargets(repoPath);
  const usedNames = new Set<string>();
  const services: ServiceSuggestion[] = [];

  for (const target of targets) {
    if (typeof target.packageJson.scripts?.dev !== "string") {
      continue;
    }

    services.push({
      command: packageManager.runDevCommand,
      ...(target.relativeDir === "." ? {} : { cwd: target.relativeDir }),
      name: createUniqueServiceName(inferServiceBaseName(target), usedNames),
    });
  }

  return services;
}

function buildManifestText(input: {
  packageManager: PackageManagerConfig | null;
  services: ServiceSuggestion[];
}): string {
  const manifest = {
    workspace: {
      prepare: input.packageManager
        ? [
            {
              name: "install",
              command: input.packageManager.installCommand,
              timeout_seconds: 300,
            },
          ]
        : [],
    },
    environment: Object.fromEntries(
      input.services.map((service) => [
        service.name,
        {
          kind: "service",
          runtime: "process",
          command: service.command,
          ...(service.cwd ? { cwd: service.cwd } : {}),
        },
      ]),
    ),
  };

  const headerLines = [
    "// Generated by `lifecycle repo init`.",
    input.services.length > 0
      ? "// Review the inferred commands and add health checks or dependency edges before relying on this in shared workflows."
      : "// No runnable dev services were inferred. Add entries under `environment` to match your workflow.",
  ];

  return `${headerLines.join("\n")}\n${JSON.stringify(manifest, null, 2)}\n`;
}

async function resolveRepoTarget(inputPath?: string): Promise<{
  manifestPath: string;
  repoPath: string;
}> {
  const resolvedPath = path.resolve(inputPath ?? process.cwd());

  if (path.basename(resolvedPath) === MANIFEST_FILE_NAME) {
    const repoPath = path.dirname(resolvedPath);
    const repoStats = await stat(repoPath).catch(() => null);
    if (!repoStats?.isDirectory()) {
      throw new BridgeClientError({
        code: "manifest_not_found",
        message: `Lifecycle could not find repo directory ${repoPath}.`,
        suggestedAction: "Pass a valid repo path or lifecycle.json path, then retry.",
      });
    }

    return {
      manifestPath: resolvedPath,
      repoPath,
    };
  }

  const repoStats = await stat(resolvedPath).catch(() => null);
  if (!repoStats?.isDirectory()) {
    throw new BridgeClientError({
      code: "manifest_not_found",
      message: `Lifecycle could not find repo directory ${resolvedPath}.`,
      suggestedAction: "Pass a valid repo path, then retry.",
    });
  }

  return {
    manifestPath: path.join(resolvedPath, MANIFEST_FILE_NAME),
    repoPath: resolvedPath,
  };
}

export default defineCommand({
  description: "Generate a lifecycle.json starter from the current repo.",
  input: z.object({
    force: defineFlag(
      z.boolean().default(false).describe("Overwrite an existing lifecycle.json."),
      {
        aliases: "f",
      },
    ),
    json: jsonFlag,
    path: z
      .string()
      .optional()
      .describe("Repo path or lifecycle.json path. Defaults to the current directory."),
  }),
  run: async (input, context) => {
    try {
      const target = await resolveRepoTarget(input.path);
      const alreadyExists = await pathExists(target.manifestPath);
      if (alreadyExists && !input.force) {
        throw new BridgeClientError({
          code: "manifest_exists",
          details: {
            manifestPath: target.manifestPath,
          },
          message: `Lifecycle found an existing manifest at ${target.manifestPath}.`,
          suggestedAction: "Re-run with --force to overwrite it, or edit the file manually.",
        });
      }

      const packageManager = await detectPackageManager(target.repoPath);
      const services = await inferServiceSuggestions(target.repoPath, packageManager);
      const manifestText = buildManifestText({
        packageManager,
        services,
      });

      await writeFile(target.manifestPath, manifestText, "utf8");

      const result = {
        manifestPath: target.manifestPath,
        overwritten: alreadyExists,
        packageManager: packageManager?.name ?? null,
        services,
      };

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      context.stdout(`${alreadyExists ? "Updated" : "Created"} ${target.manifestPath}`);
      context.stdout(`package manager: ${packageManager?.name ?? "none detected"}`);
      context.stdout(
        services.length > 0
          ? `services: ${services.map((service) => service.name).join(", ")}`
          : "services: none inferred",
      );
      context.stdout("next: lifecycle prepare");
      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
