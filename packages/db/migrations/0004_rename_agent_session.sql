ALTER TABLE agent_session RENAME TO agent;
ALTER TABLE agent RENAME COLUMN provider_session_id TO provider_id;

DROP INDEX IF EXISTS idx_agent_session_workspace;
CREATE INDEX IF NOT EXISTS idx_agent_workspace
ON agent(workspace_id, created_at DESC);

ALTER TABLE agent_message RENAME COLUMN session_id TO agent_id;
DROP INDEX IF EXISTS idx_agent_message_session;
CREATE INDEX IF NOT EXISTS idx_agent_message_agent
ON agent_message(agent_id, created_at ASC);

ALTER TABLE agent_message_part RENAME COLUMN session_id TO agent_id;

ALTER TABLE agent_event RENAME COLUMN session_id TO agent_id;
ALTER TABLE agent_event RENAME COLUMN provider_session_id TO provider_id;
DROP INDEX IF EXISTS idx_agent_event_session;
CREATE INDEX IF NOT EXISTS idx_agent_event_agent
ON agent_event(agent_id, event_index ASC);

ALTER TABLE task RENAME COLUMN agent_session_id TO agent_id;
