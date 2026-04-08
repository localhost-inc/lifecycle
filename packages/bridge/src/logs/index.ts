import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { resolveLifecyclePath, type SqlDriver } from "@lifecycle/db";
import { getRepositoryById, getWorkspaceRecordById } from "@lifecycle/db/queries";
import { stackLogFileName, stackLogPathSegments, type StackLogScope } from "@lifecycle/stack";
import type { WorkspaceClientRegistry } from "@lifecycle/workspace";

import { BridgeError } from "../errors";
import { listWorkspaceStack } from "../stack";

export interface BridgeLogLine {
  service: string;
  stream: "stderr" | "stdout";
  text: string;
  timestamp: string;
}

interface BridgeLogCursor {
  offsets: Record<
    string,
    {
      stderr: number;
      stdout: number;
    }
  >;
}

export interface ReadBridgeLogsOptions {
  cursor?: string;
  serviceName?: string;
  tail?: number;
}

export interface ReadBridgeLogsResult {
  cursor: string;
  lines: BridgeLogLine[];
}

function stackLogDir(scope: StackLogScope): string {
  return resolveLifecyclePath(stackLogPathSegments(scope));
}

function logFilePath(
  scope: StackLogScope,
  serviceName: string,
  stream: "stderr" | "stdout",
): string {
  return resolve(stackLogDir(scope), stackLogFileName(serviceName, stream));
}

async function resolveLogScope(db: SqlDriver, workspaceId: string): Promise<StackLogScope> {
  const workspace = await getWorkspaceRecordById(db, workspaceId);
  if (!workspace) {
    throw new BridgeError({
      code: "workspace_not_found",
      message: `Could not resolve workspace "${workspaceId}".`,
      status: 404,
    });
  }

  const repository = await getRepositoryById(db, workspace.repository_id);
  if (!repository) {
    throw new BridgeError({
      code: "repository_not_found",
      message: `Could not resolve repository "${workspace.repository_id}" for workspace "${workspaceId}".`,
      status: 404,
    });
  }

  return {
    repositorySlug: repository.slug,
    workspaceSlug: workspace.slug,
  };
}

function decodeCursor(cursor?: string): BridgeLogCursor {
  if (!cursor) {
    return { offsets: {} };
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      offsets?: unknown;
    };
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.offsets ||
      typeof parsed.offsets !== "object"
    ) {
      return { offsets: {} };
    }
    return {
      offsets: Object.fromEntries(
        Object.entries(parsed.offsets).map(([service, value]) => {
          const entry = value as { stderr?: unknown; stdout?: unknown };
          return [
            service,
            {
              stderr: typeof entry.stderr === "number" ? entry.stderr : 0,
              stdout: typeof entry.stdout === "number" ? entry.stdout : 0,
            },
          ];
        }),
      ),
    };
  } catch {
    return { offsets: {} };
  }
}

function encodeCursor(cursor: BridgeLogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function readLastLines(filePath: string, maxLines: number): string[] {
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter((line) => line.length > 0);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

async function readLinesFromOffset(filePath: string, offset: number): Promise<string[]> {
  if (!existsSync(filePath)) {
    return [];
  }

  return await new Promise((resolvePromise, reject) => {
    const lines: string[] = [];
    const stream = createReadStream(filePath, { encoding: "utf8", start: offset });
    const reader = createInterface({ input: stream });

    reader.on("line", (line) => {
      if (line.length > 0) {
        lines.push(line);
      }
    });
    reader.once("close", () => resolvePromise(lines));
    reader.once("error", reject);
    stream.once("error", reject);
  });
}

function currentFileSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

export async function readBridgeLogs(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
  options: ReadBridgeLogsOptions,
): Promise<ReadBridgeLogsResult> {
  const logScope = await resolveLogScope(db, workspaceId);
  const stack = await listWorkspaceStack(db, workspaceRegistry, workspaceId);
  const serviceNames = stack.nodes.flatMap((node) => (node.kind === "service" ? [node.name] : []));
  const availableNames = new Set(serviceNames);
  const targetServiceNames = options.serviceName ? [options.serviceName] : serviceNames;

  if (options.serviceName && !availableNames.has(options.serviceName)) {
    throw new BridgeError({
      code: "service_not_found",
      message: `Service "${options.serviceName}" is not configured for workspace "${workspaceId}".`,
      status: 404,
    });
  }

  const decoded = decodeCursor(options.cursor);
  const nextCursor: BridgeLogCursor = { offsets: { ...decoded.offsets } };
  const lines: BridgeLogLine[] = [];
  const timestamp = new Date().toISOString();

  for (const serviceName of targetServiceNames) {
    const existingOffsets = nextCursor.offsets[serviceName] ?? { stderr: 0, stdout: 0 };
    for (const stream of ["stdout", "stderr"] as const) {
      const filePath = logFilePath(logScope, serviceName, stream);

      if (!options.cursor) {
        const lastLines = readLastLines(filePath, options.tail ?? 50);
        for (const text of lastLines) {
          lines.push({ service: serviceName, stream, text, timestamp: "" });
        }
        existingOffsets[stream] = currentFileSize(filePath);
        continue;
      }

      const currentSize = currentFileSize(filePath);
      const startOffset = currentSize < existingOffsets[stream] ? 0 : existingOffsets[stream];
      const appendedLines = await readLinesFromOffset(filePath, startOffset);
      for (const text of appendedLines) {
        lines.push({ service: serviceName, stream, text, timestamp });
      }
      existingOffsets[stream] = currentSize;
    }
    nextCursor.offsets[serviceName] = existingOffsets;
  }

  return {
    cursor: encodeCursor(nextCursor),
    lines,
  };
}
