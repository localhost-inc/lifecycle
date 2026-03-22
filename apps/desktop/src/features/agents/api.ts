import { isTauri } from "@tauri-apps/api/core";
import type {
  AgentBackend,
  AgentMessageRecord,
  AgentRuntimeKind,
  AgentSessionRecord,
} from "@lifecycle/contracts";
import { insertAgentSession } from "@lifecycle/store";
import { invokeTauri } from "@/lib/tauri-error";
import { tauriSqlDriver } from "@/lib/sql-driver";

const AGENT_ACCESS_UNAVAILABLE_MESSAGE = "Agent access requires the Tauri desktop shell.";

function requireDesktopAgentAccess(): void {
  if (!isTauri()) {
    throw new Error(AGENT_ACCESS_UNAVAILABLE_MESSAGE);
  }
}

export interface CreateAgentSessionInput {
  workspaceId: string;
  backend: AgentBackend;
  runtimeKind?: AgentRuntimeKind;
  runtimeName?: string | null;
  title?: string;
  runtimeSessionId?: string | null;
}

export async function createAgentSession(
  input: CreateAgentSessionInput,
): Promise<AgentSessionRecord> {
  requireDesktopAgentAccess();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const session: AgentSessionRecord = {
    id,
    workspace_id: input.workspaceId,
    runtime_kind: input.runtimeKind ?? "native",
    runtime_name: input.runtimeName ?? null,
    backend: input.backend,
    runtime_session_id: input.runtimeSessionId ?? null,
    title: input.title ?? "",
    status: "idle",
    created_by: null,
    forked_from_session_id: null,
    last_message_at: null,
    created_at: now,
    updated_at: now,
    ended_at: null,
  };

  await insertAgentSession(tauriSqlDriver, {
    id: session.id,
    workspace_id: session.workspace_id,
    runtime_kind: session.runtime_kind,
    runtime_name: session.runtime_name,
    backend: session.backend,
    runtime_session_id: session.runtime_session_id,
    title: session.title,
    status: session.status,
    created_by: session.created_by,
    forked_from_session_id: session.forked_from_session_id,
  });

  return session;
}

export async function listAgentSessions(workspaceId: string): Promise<AgentSessionRecord[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return invokeTauri<AgentSessionRecord[]>("list_agent_sessions_for_workspace", {
    workspaceId,
  });
}

export async function getAgentSession(agentSessionId: string): Promise<AgentSessionRecord | null> {
  if (!isTauri()) {
    void agentSessionId;
    return null;
  }

  return invokeTauri<AgentSessionRecord | null>("get_agent_session", {
    agentSessionId,
  });
}

export async function listAgentSessionMessages(
  agentSessionId: string,
): Promise<AgentMessageRecord[]> {
  if (!isTauri()) {
    void agentSessionId;
    return [];
  }

  return invokeTauri<AgentMessageRecord[]>("list_agent_session_messages", {
    agentSessionId,
  });
}
