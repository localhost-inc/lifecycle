export interface AgentModelCatalogEntry {
  defaultReasoningEffort: null | string;
  description: null | string;
  label: string;
  reasoningEfforts: string[];
  value: string;
}

export interface AgentModelCatalog {
  defaultModel: null | string;
  fetchedAt: string;
  models: AgentModelCatalogEntry[];
  provider: "claude" | "codex";
  source: string;
  warnings: string[];
}
