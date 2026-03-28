export interface ServiceLogLine {
  stream: "stderr" | "stdout";
  text: string;
}

export interface ServiceLogSnapshot {
  lines: ServiceLogLine[];
  name: string;
}

export function recordWorkspaceServiceLogLine(
  logsByWorkspace: Map<string, Map<string, ServiceLogLine[]>>,
  input: {
    line: ServiceLogLine;
    maxLinesPerService?: number;
    serviceName: string;
    workspaceId: string;
  },
): void {
  const maxLinesPerService = input.maxLinesPerService ?? Infinity;
  const workspaceLogs = logsByWorkspace.get(input.workspaceId) ?? new Map();
  const existing = workspaceLogs.get(input.serviceName) ?? [];
  const nextLines =
    existing.length >= maxLinesPerService
      ? [...existing.slice(1), input.line]
      : [...existing, input.line];
  workspaceLogs.set(input.serviceName, nextLines);
  logsByWorkspace.set(input.workspaceId, workspaceLogs);
}

export function selectWorkspaceServiceLogs(
  logsByWorkspace: Map<string, Map<string, ServiceLogLine[]>>,
  workspaceId: string,
): ServiceLogSnapshot[] {
  const workspaceLogs = logsByWorkspace.get(workspaceId);
  if (!workspaceLogs) {
    return [];
  }

  return [...workspaceLogs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, lines]) => ({
      lines: [...lines],
      name,
    }));
}
