import type { WorkspaceHost } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import type { AgentClient } from "../client";

export async function reattachActiveAgentSessions(input: {
  agentClient: AgentClient;
  driver: SqlDriver;
  workspaceHost: WorkspaceHost;
}): Promise<void> {
  const sessions = await input.driver.select<{ id: string }>(
    `SELECT agent_session.id AS id
       FROM agent_session
       INNER JOIN workspace ON workspace.id = agent_session.workspace_id
      WHERE workspace.host = $1
        AND agent_session.status NOT IN ('completed', 'failed', 'cancelled')`,
    [input.workspaceHost],
  );

  await Promise.all(
    sessions.map(async ({ id }) => {
      try {
        await input.agentClient.attachSession(id);
      } catch (error) {
        console.error(`[agent] failed to reattach session ${id}:`, error);
      }
    }),
  );
}
