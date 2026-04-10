import type { ChildProcess } from "node:child_process";
import type { AgentHandle } from "@lifecycle/agents/internal/handle";
import type {
  AgentCommand,
  AgentStreamEvent,
  AgentInputPart,
  AgentStreamSnapshot,
} from "@lifecycle/agents/internal/stream-protocol";
import type {
  AgentApprovalResolution,
  AgentProviderId,
  AgentProviderRequestResolution,
} from "@lifecycle/contracts";
import type { AgentTurnCancelRequest, AgentTurnRequest } from "@lifecycle/agents";

export interface AgentDirectCallbacks {
  onEvent: (event: AgentStreamEvent) => void | Promise<void>;
  onState: (snapshot: AgentStreamSnapshot) => void | Promise<void>;
}

function createLineReader(onLine: (line: string) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    while (true) {
      const index = buffer.indexOf("\n");
      if (index < 0) return;
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.length > 0) onLine(line);
    }
  };
}

function buildInitialSnapshot(
  agentId: string,
  provider: AgentProviderId,
): AgentStreamSnapshot {
  return {
    kind: "agent.state",
    provider,
    providerId: null,
    agentId,
    status: "starting",
    activeTurnId: null,
    pendingApproval: null,
    updatedAt: new Date().toISOString(),
  };
}

function updateSnapshotFromEvent(
  snapshot: AgentStreamSnapshot,
  event: AgentStreamEvent,
): AgentStreamSnapshot {
  const updatedAt = new Date().toISOString();

  switch (event.kind) {
    case "agent.ready":
      return { ...snapshot, providerId: event.providerId, updatedAt };
    case "agent.approval.requested":
      return {
        ...snapshot,
        status: event.approval.kind === "question" ? "waiting_input" : "waiting_approval",
        pendingApproval: { id: event.approval.id, kind: event.approval.kind },
        updatedAt,
      };
    case "agent.approval.resolved":
      return { ...snapshot, status: "running", pendingApproval: null, updatedAt };
    case "agent.turn.completed":
      return { ...snapshot, status: "idle", activeTurnId: null, pendingApproval: null, updatedAt };
    case "agent.turn.failed":
      return { ...snapshot, status: "failed", activeTurnId: null, pendingApproval: null, updatedAt };
    default:
      return snapshot;
  }
}

function updateSnapshotFromCommand(
  snapshot: AgentStreamSnapshot,
  command: AgentCommand,
): AgentStreamSnapshot {
  const updatedAt = new Date().toISOString();

  switch (command.kind) {
    case "agent.send_turn":
      return { ...snapshot, status: "running", activeTurnId: command.turnId, pendingApproval: null, updatedAt };
    case "agent.cancel_turn":
      return { ...snapshot, status: "failed", activeTurnId: null, pendingApproval: null, updatedAt };
    case "agent.resolve_approval":
    case "agent.resolve_request":
      return { ...snapshot, status: "running", pendingApproval: null, updatedAt };
  }
}

/**
 * A direct agent connection that manages a provider child process via
 * piped stdin/stdout. No CLI intermediary, no WebSocket proxy.
 */
export class AgentDirectHandle implements AgentHandle {
  private child: ChildProcess;
  private snapshot: AgentStreamSnapshot;
  private alive = true;

  constructor(
    child: ChildProcess,
    agentId: string,
    provider: AgentProviderId,
    callbacks: AgentDirectCallbacks,
  ) {
    this.child = child;
    this.snapshot = buildInitialSnapshot(agentId, provider);

    const reader = createLineReader((line) => {
      let event: AgentStreamEvent;
      try {
        event = JSON.parse(line) as AgentStreamEvent;
      } catch {
        return;
      }

      this.snapshot = updateSnapshotFromEvent(this.snapshot, event);
      void Promise.resolve(callbacks.onState(this.snapshot)).catch(() => {});
      void Promise.resolve(callbacks.onEvent(event)).catch(() => {});
    });

    child.stdout?.on("data", (chunk: Buffer) => reader(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text.length > 0) {
        console.error(`[bridge-agent][${agentId}] ${text}`);
      }
    });
    child.on("error", (error) => {
      this.alive = false;
      const failedSnapshot: AgentStreamSnapshot = {
        ...this.snapshot,
        status: "failed",
        activeTurnId: null,
        pendingApproval: null,
        updatedAt: new Date().toISOString(),
      };
      this.snapshot = failedSnapshot;
      void Promise.resolve(callbacks.onState(failedSnapshot)).catch(() => {});
      console.error(`[bridge-agent][${agentId}] provider error: ${error.message}`);
    });
    child.on("close", (code, signal) => {
      this.alive = false;
      const closedSnapshot: AgentStreamSnapshot = {
        ...this.snapshot,
        status: "failed",
        activeTurnId: null,
        pendingApproval: null,
        updatedAt: new Date().toISOString(),
      };
      this.snapshot = closedSnapshot;
      void Promise.resolve(callbacks.onState(closedSnapshot)).catch(() => {});
      console.info(
        `[bridge-agent][${agentId}] provider exited code=${code ?? "null"} signal=${signal ?? "null"}`,
      );
    });
  }

  isHealthy(): boolean {
    return this.alive;
  }

  async sendTurn(turn: AgentTurnRequest): Promise<void> {
    const parts = turn.input
      .map((part) => {
        if (part.type === "text") {
          const trimmed = part.text.trim();
          return trimmed.length > 0 ? { type: "text" as const, text: trimmed } : null;
        }
        if (part.type === "image") {
          return { type: "image" as const, mediaType: part.mediaType, base64Data: part.base64Data };
        }
        return null;
      })
      .filter(Boolean);

    if (parts.length === 0) {
      throw new Error("Agent prompt cannot be empty.");
    }

    this.writeCommand({
      kind: "agent.send_turn",
      input: parts as AgentInputPart[],
      turnId: turn.turnId,
    });
  }

  async cancelTurn(request: AgentTurnCancelRequest): Promise<void> {
    this.writeCommand({
      kind: "agent.cancel_turn",
      turnId: request.turnId ?? null,
    });
  }

  async resolveApproval(request: AgentApprovalResolution): Promise<void> {
    this.writeCommand({
      kind: "agent.resolve_approval",
      approvalId: request.approvalId,
      decision: request.decision,
      response: request.response ?? null,
    });
  }

  async resolveProviderRequest(
    request: Omit<AgentProviderRequestResolution, "metadata">,
  ): Promise<void> {
    this.writeCommand({
      kind: "agent.resolve_request",
      outcome: request.outcome,
      requestId: request.requestId,
      response: request.response ?? null,
    });
  }

  private writeCommand(command: AgentCommand): void {
    if (!this.alive || !this.child.stdin) {
      throw new Error("Agent provider is not running.");
    }
    this.snapshot = updateSnapshotFromCommand(this.snapshot, command);
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }
}
