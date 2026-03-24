import type { AgentSessionProviderId, AgentSessionRecord } from "@lifecycle/contracts";
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
      workspaceId: string;
      session: AgentSessionRecord;
    }
  | {
      kind: "agent.session.updated";
      workspaceId: string;
      session: AgentSessionRecord;
    }
  | {
      kind: "agent.turn.started";
      workspaceId: string;
      sessionId: string;
      turnId: string;
    }
  | {
      kind: "agent.turn.completed";
      workspaceId: string;
      sessionId: string;
      turnId: string;
    }
  | {
      kind: "agent.turn.failed";
      workspaceId: string;
      sessionId: string;
      turnId: string;
      error: string;
    }
  | {
      kind: "agent.message.created";
      workspaceId: string;
      sessionId: string;
      messageId: string;
      role: AgentMessageRole;
      turnId: string | null;
    }
  | {
      kind: "agent.message.part.delta";
      workspaceId: string;
      sessionId: string;
      messageId: string;
      partId: string;
      part: AgentMessagePart;
    }
  | {
      kind: "agent.message.part.completed";
      workspaceId: string;
      sessionId: string;
      messageId: string;
      partId: string;
      part: AgentMessagePart;
    }
  | {
      kind: "agent.tool_call.updated";
      workspaceId: string;
      sessionId: string;
      toolCall: AgentToolCallUpdate;
    }
  | {
      kind: "agent.approval.requested";
      workspaceId: string;
      sessionId: string;
      approval: AgentApprovalRequest;
    }
  | {
      kind: "agent.approval.resolved";
      workspaceId: string;
      sessionId: string;
      resolution: AgentApprovalResolution;
    }
  | {
      kind: "agent.artifact.published";
      workspaceId: string;
      sessionId: string;
      artifact: AgentArtifactDescriptor;
    }
  | {
      kind: "agent.status.updated";
      workspaceId: string;
      sessionId: string;
      status: string;
      detail?: string | null;
    }
  | {
      kind: "agent.auth.updated";
      workspaceId: string;
      sessionId: string;
      provider: AgentSessionProviderId;
      authenticated: boolean;
      mode?: string | null;
    };

export type AgentEventKind = AgentEvent["kind"];
export type AgentEventOf<Kind extends AgentEventKind> = Extract<AgentEvent, { kind: Kind }>;
export type AgentEventObserver = (event: AgentEvent) => void | Promise<void>;
