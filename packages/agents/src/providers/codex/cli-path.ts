import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function findCodexCliInBunStore(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const bunStoreDir = join(currentDir, "node_modules", ".bun");
    if (existsSync(bunStoreDir)) {
      for (const entry of readdirSync(bunStoreDir)) {
        if (!entry.startsWith("@openai+codex@")) {
          continue;
        }

        const candidate = join(
          bunStoreDir,
          entry,
          "node_modules",
          "@openai",
          "codex",
          "bin",
          "codex.js",
        );
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

export function resolveCodexCliPath(): string {
  const require = createRequire(import.meta.url);

  try {
    return require.resolve("@openai/codex/bin/codex.js");
  } catch {}

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const fallback = findCodexCliInBunStore(moduleDir) ?? findCodexCliInBunStore(process.cwd());
  if (fallback) {
    return fallback;
  }

  throw new Error(
    "Could not resolve the Codex CLI binary. Install @openai/codex or reinstall dependencies.",
  );
}
