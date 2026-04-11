import { ensureBridge } from "@/bridge";

import { resolveWorkspaceId } from "../_shared";

export interface BridgeLogLine {
  service: string;
  stream: string;
  text: string;
  timestamp: string;
}

interface BridgeLogsResponse {
  cursor: string;
  lines: BridgeLogLine[];
}

export async function readBridgeLogs(options: {
  cursor?: string;
  service?: string;
  tail?: number;
  workspaceId?: string;
}): Promise<BridgeLogsResponse> {
  const workspaceId = resolveWorkspaceId(options.workspaceId);
  const { client } = await ensureBridge();
  const response = await client.workspaces[":id"].logs.$get({
    param: { id: workspaceId },
    query: {
      ...(options.cursor ? { cursor: options.cursor } : {}),
      ...(options.service ? { service: options.service } : {}),
      ...(options.tail ? { tail: options.tail } : {}),
    },
  });
  return await response.json();
}

export async function streamBridgeLogs(
  options: {
    grep?: string;
    json: boolean;
    serviceNames?: string[];
    tail?: number;
    workspaceId?: string;
  },
  output: {
    onLine: (line: BridgeLogLine) => void;
    onSleep: (ms: number) => Promise<void>;
  },
  signal: AbortSignal,
): Promise<void> {
  const grepPattern = options.grep ? new RegExp(options.grep) : null;
  const matchesGrep = (text: string): boolean => (grepPattern ? grepPattern.test(text) : true);

  const serviceKeys = options.serviceNames && options.serviceNames.length > 0 ? options.serviceNames : [undefined];
  const cursors = new Map<string, string>();

  for (const service of serviceKeys) {
    const snapshot = await readBridgeLogs({
      ...(service ? { service } : {}),
      ...(options.tail ? { tail: options.tail } : {}),
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    });
    cursors.set(service ?? "__all__", snapshot.cursor);
    for (const line of snapshot.lines) {
      if (matchesGrep(line.text)) {
        output.onLine(line);
      }
    }
  }

  while (!signal.aborted) {
    await output.onSleep(250);
    if (signal.aborted) {
      break;
    }

    for (const service of serviceKeys) {
      const cursorKey = service ?? "__all__";
      const cursor = cursors.get(cursorKey);
      const next = await readBridgeLogs({
        ...(cursor ? { cursor } : {}),
        ...(service ? { service } : {}),
        ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      });
      cursors.set(cursorKey, next.cursor);
      for (const line of next.lines) {
        if (matchesGrep(line.text)) {
          output.onLine(line);
        }
      }
    }
  }
}
