ALTER TABLE workspace ADD COLUMN kind TEXT NOT NULL DEFAULT 'managed';

CREATE INDEX IF NOT EXISTS idx_workspace_project_kind ON workspace(project_id, kind);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_project_root_unique
ON workspace(project_id)
WHERE kind = 'root';
