/**
 * Supervisor socket protocol — newline-delimited JSON over a Unix domain socket.
 */

export interface SupervisorRequest {
  id: string;
  method: string;
  workspace?: string;
  params?: Record<string, unknown>;
}

export interface SupervisorResponse {
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface SupervisorEvent {
  event: string;
  workspace?: string;
  data: unknown;
}

export type SupervisorMessage = SupervisorResponse | SupervisorEvent;

// Methods
export const METHODS = {
  // Supervisor-level
  SUPERVISOR_STATUS: "supervisor.status",
  SUPERVISOR_SHUTDOWN: "supervisor.shutdown",

  // Stack-level (scoped to a workspace)
  STACK_RUN: "stack.run",
  STACK_STOP: "stack.stop",
  STACK_STATUS: "stack.status",
  STACK_LOGS: "stack.logs",
} as const;

// Events
export const EVENTS = {
  SERVICE_STATUS: "service.status",
  SERVICE_LOG: "service.log",
  STACK_READY: "stack.ready",
  STACK_FAILED: "stack.failed",
} as const;

export function encodeMessage(msg: SupervisorMessage): string {
  return JSON.stringify(msg) + "\n";
}

export function parseRequest(line: string): SupervisorRequest | null {
  try {
    const parsed = JSON.parse(line.trim());
    if (typeof parsed.id === "string" && typeof parsed.method === "string") {
      return parsed as SupervisorRequest;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseResponse(line: string): SupervisorMessage | null {
  try {
    return JSON.parse(line.trim()) as SupervisorMessage;
  } catch {
    return null;
  }
}
