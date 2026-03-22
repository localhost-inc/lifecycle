import type { AgentBackend, AgentSessionRecord } from "@lifecycle/contracts";
import type {
  AgentApprovalRequest,
  AgentApprovalResolution,
  AgentArtifactDescriptor,
  AgentMessagePart,
  AgentMessageRole,
  AgentToolCallUpdate,
} from "./turn";

export type AgentEvent =
  | {
      kind: "agent.session.created";
      workspace_id: string;
      session: AgentSessionRecord;
    }
  | {
      kind: "agent.session.updated";
      workspace_id: string;
      session: AgentSessionRecord;
    }
  | {
      kind: "agent.turn.started";
      workspace_id: string;
      session_id: string;
      turn_id: string;
    }
  | {
      kind: "agent.turn.completed";
      workspace_id: string;
      session_id: string;
      turn_id: string;
    }
  | {
      kind: "agent.turn.failed";
      workspace_id: string;
      session_id: string;
      turn_id: string;
      error: string;
    }
  | {
      kind: "agent.message.created";
      workspace_id: string;
      session_id: string;
      message_id: string;
      role: AgentMessageRole;
    }
  | {
      kind: "agent.message.part.delta";
      workspace_id: string;
      session_id: string;
      message_id: string;
      part_id: string;
      part: AgentMessagePart;
    }
  | {
      kind: "agent.message.part.completed";
      workspace_id: string;
      session_id: string;
      message_id: string;
      part_id: string;
      part: AgentMessagePart;
    }
  | {
      kind: "agent.tool_call.updated";
      workspace_id: string;
      session_id: string;
      tool_call: AgentToolCallUpdate;
    }
  | {
      kind: "agent.approval.requested";
      workspace_id: string;
      session_id: string;
      approval: AgentApprovalRequest;
    }
  | {
      kind: "agent.approval.resolved";
      workspace_id: string;
      session_id: string;
      resolution: AgentApprovalResolution;
    }
  | {
      kind: "agent.artifact.published";
      workspace_id: string;
      session_id: string;
      artifact: AgentArtifactDescriptor;
    }
  | {
      kind: "agent.auth.updated";
      backend: AgentBackend;
      authenticated: boolean;
      mode?: string | null;
    };

export type AgentEventKind = AgentEvent["kind"];
export type AgentEventOf<Kind extends AgentEventKind> = Extract<AgentEvent, { kind: Kind }>;
export type AgentEventObserver = (event: AgentEvent) => void | Promise<void>;
