export interface ProviderModelCatalogEntry {
  defaultReasoningEffort: null | string;
  description: null | string;
  label: string;
  reasoningEfforts: string[];
  value: string;
}

export interface ProviderModelCatalog {
  defaultModel: null | string;
  fetchedAt: string;
  models: ProviderModelCatalogEntry[];
  provider: "claude" | "codex";
  source: string;
  warnings: string[];
}
