import type {
  AgentAdapterRuntime,
  AgentBackendAdapter,
  AgentBackendSession,
  AgentBackendSessionBootstrap,
  AgentInputPart,
  AgentTurnRequest,
} from "@lifecycle/agents";
import type { AgentSessionRecord } from "@lifecycle/contracts";

function buildAssistantCopy(inputText: string, backendLabel: string, runtimeLabel: string): string {
  return `${backendLabel} responding on ${runtimeLabel}: ${inputText}`;
}

function readPrimaryText(input: AgentInputPart[]): string {
  const textPart = input.find((part) => part.type === "text");
  return textPart?.text?.trim() || "No prompt text provided.";
}

async function emitAssistantMessage(input: {
  backendLabel: string;
  runtime: AgentAdapterRuntime;
  runtimeLabel: string;
  session: AgentSessionRecord;
  turn: AgentTurnRequest;
}): Promise<void> {
  const inputText = readPrimaryText(input.turn.input);
  const messageId = `${input.turn.turn_id}:assistant`;
  const partId = `${messageId}:part:1`;

  await input.runtime.emit({
    kind: "agent.turn.started",
    workspace_id: input.session.workspace_id,
    session_id: input.session.id,
    turn_id: input.turn.turn_id,
  });
  await input.runtime.emit({
    kind: "agent.message.created",
    workspace_id: input.session.workspace_id,
    session_id: input.session.id,
    message_id: messageId,
    role: "assistant",
  });
  await input.runtime.emit({
    kind: "agent.message.part.completed",
    workspace_id: input.session.workspace_id,
    session_id: input.session.id,
    message_id: messageId,
    part_id: partId,
    part: {
      type: "text",
      text: buildAssistantCopy(inputText, input.backendLabel, input.runtimeLabel),
    },
  });
  await input.runtime.emit({
    kind: "agent.turn.completed",
    workspace_id: input.session.workspace_id,
    session_id: input.session.id,
    turn_id: input.turn.turn_id,
  });
}

abstract class BaseStubBackendAdapter implements AgentBackendAdapter {
  abstract readonly backend: "claude" | "codex";

  protected backendLabel(): string {
    return this.backend === "claude" ? "Claude" : "Codex";
  }

  async create_session(
    input: AgentBackendSessionBootstrap,
    runtime: AgentAdapterRuntime,
  ): Promise<AgentBackendSession> {
    const runtimeTarget = runtime.runtime_context.workspace_target;
    return {
      session: {
        ...input.session,
        runtime_name: `${this.backend}@${runtimeTarget}`,
        title: input.session.title || this.backendLabel(),
      },
    };
  }

  async send_turn(
    turn: AgentTurnRequest,
    session: AgentSessionRecord,
    runtime: AgentAdapterRuntime,
  ): Promise<void> {
    await emitAssistantMessage({
      backendLabel: this.backendLabel(),
      runtime,
      runtimeLabel: runtime.runtime_context.workspace_target,
      session,
      turn,
    });
  }

  async cancel_turn(): Promise<void> {}

  async resolve_approval(): Promise<void> {}
}

export class ClaudeStubBackendAdapter extends BaseStubBackendAdapter {
  readonly backend = "claude" as const;
}

export class CodexStubBackendAdapter extends BaseStubBackendAdapter {
  readonly backend = "codex" as const;
}
