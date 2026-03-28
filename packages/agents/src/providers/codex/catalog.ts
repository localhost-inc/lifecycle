import type { AgentModelCatalog, AgentModelCatalogEntry } from "../../catalog";
import { CodexAppServerClient, type CodexAccountReadResult } from "./app-server";

interface CodexReasoningEffortOption {
  description: string;
  reasoningEffort: string;
}

interface CodexModelListEntry {
  defaultReasoningEffort?: string;
  description?: string;
  displayName?: string;
  hidden?: boolean;
  isDefault?: boolean;
  model?: string;
  supportedReasoningEfforts?: CodexReasoningEffortOption[];
}

interface CodexModelListResponse {
  data?: CodexModelListEntry[];
  nextCursor?: string | null;
}

async function readAccount(client: CodexAppServerClient): Promise<CodexAccountReadResult> {
  return (await client.request("account/read", {
    refreshToken: false,
  })) as CodexAccountReadResult;
}

function buildSource(account: CodexAccountReadResult): string {
  if (account.account?.type === "apiKey") {
    return "codex_app_server.apiKey+model/list";
  }
  if (account.account?.type === "chatgpt") {
    return "codex_app_server.chatgpt+model/list";
  }
  return "codex_app_server+model/list";
}

function normalizeModel(entry: CodexModelListEntry): AgentModelCatalogEntry | null {
  if (entry.hidden === true || typeof entry.model !== "string" || entry.model.trim().length === 0) {
    return null;
  }

  return {
    defaultReasoningEffort:
      typeof entry.defaultReasoningEffort === "string" ? entry.defaultReasoningEffort : null,
    description: typeof entry.description === "string" ? entry.description : null,
    label:
      typeof entry.displayName === "string" && entry.displayName.trim().length > 0
        ? entry.displayName
        : entry.model,
    reasoningEfforts: Array.isArray(entry.supportedReasoningEfforts)
      ? entry.supportedReasoningEfforts.flatMap((option) =>
          typeof option?.reasoningEffort === "string" ? [option.reasoningEffort] : [],
        )
      : [],
    value: entry.model,
  };
}

async function listModels(client: CodexAppServerClient): Promise<CodexModelListEntry[]> {
  const models: CodexModelListEntry[] = [];
  let cursor: string | null | undefined = null;

  do {
    const response = (await client.request("model/list", {
      ...(cursor ? { cursor } : {}),
      includeHidden: false,
      limit: 100,
    })) as CodexModelListResponse;

    if (Array.isArray(response.data)) {
      models.push(...response.data);
    }

    cursor =
      typeof response.nextCursor === "string" && response.nextCursor.length > 0
        ? response.nextCursor
        : null;
  } while (cursor);

  return models;
}

export async function getCodexModelCatalog(): Promise<AgentModelCatalog> {
  const client = new CodexAppServerClient();

  try {
    await client.initialize();
    const [account, discoveredModels] = await Promise.all([
      readAccount(client),
      listModels(client),
    ]);
    const models = discoveredModels
      .map(normalizeModel)
      .filter((entry): entry is AgentModelCatalogEntry => entry !== null);
    const defaultModel =
      discoveredModels.find((entry) => entry.isDefault === true && typeof entry.model === "string")
        ?.model ??
      models[0]?.value ??
      null;

    return {
      defaultModel,
      fetchedAt: new Date().toISOString(),
      models,
      provider: "codex",
      source: buildSource(account),
      warnings: models.length === 0 ? ["Codex app-server returned no visible models."] : [],
    };
  } finally {
    await client.close();
  }
}
