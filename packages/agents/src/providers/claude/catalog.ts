import {
  unstable_v2_createSession,
  type ModelInfo,
  type SDKSession,
} from "@anthropic-ai/claude-agent-sdk";
import type { ProviderModelCatalog, ProviderModelCatalogEntry } from "../../catalog";
import { buildSessionEnv, type ClaudeLoginMethod } from "./env";

interface ClaudeQuerySurface {
  initializationResult?: () => Promise<{ models?: ModelInfo[] }>;
  supportedModels?: () => Promise<ModelInfo[]>;
}

interface ClaudeCatalogSession extends SDKSession {
  query?: ClaudeQuerySurface;
}

function cleanDisplayName(name: string): string {
  return name
    .replace(/\s*\((?:with\s+)?\d+[A-Za-z]+ context\)/g, "")
    .replace(/\s*\(recommended\)/gi, "");
}

function mapClaudeModel(model: ModelInfo): ProviderModelCatalogEntry {
  return {
    defaultReasoningEffort: null,
    description: model.description ?? null,
    label: cleanDisplayName(model.displayName),
    reasoningEfforts:
      model.supportsEffort && Array.isArray(model.supportedEffortLevels)
        ? [...model.supportedEffortLevels]
        : [],
    value: model.value,
  };
}

async function readClaudeModels(
  session: ClaudeCatalogSession,
): Promise<{ models: ModelInfo[]; source: string }> {
  const query = session.query;
  if (!query) {
    throw new Error("Claude session query surface is unavailable.");
  }

  if (typeof query.supportedModels === "function") {
    return {
      models: await query.supportedModels(),
      source: "claude_sdk.supportedModels",
    };
  }

  if (typeof query.initializationResult === "function") {
    const result = await query.initializationResult();
    return {
      models: Array.isArray(result.models) ? result.models : [],
      source: "claude_sdk.initializationResult",
    };
  }

  throw new Error("Claude SDK did not expose a model catalog method.");
}

export async function getClaudeModelCatalog(input?: {
  loginMethod?: ClaudeLoginMethod;
}): Promise<ProviderModelCatalog> {
  const session = unstable_v2_createSession({
    env: buildSessionEnv(input?.loginMethod ?? "claudeai"),
    model: "default",
  }) as ClaudeCatalogSession;

  try {
    const { models, source } = await readClaudeModels(session);
    return {
      defaultModel: models.find((model) => model.value === "default")?.value ?? models[0]?.value ?? null,
      fetchedAt: new Date().toISOString(),
      models: models.map(mapClaudeModel),
      provider: "claude",
      source,
      warnings: [],
    };
  } finally {
    session.close();
  }
}
