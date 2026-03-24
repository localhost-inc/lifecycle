import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";

let initializationModels: ModelInfo[] = [];
let supportedModels: ModelInfo[] | null = [];
let closeCalls = 0;

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  unstable_v2_createSession() {
    return {
      close() {
        closeCalls += 1;
      },
      query: {
        async initializationResult() {
          return { models: initializationModels };
        },
        ...(supportedModels
          ? {
              async supportedModels() {
                return supportedModels;
              },
            }
          : {}),
      },
    };
  },
}));

const { getClaudeModelCatalog } = await import("./catalog");

describe("claude model catalog", () => {
  beforeEach(() => {
    closeCalls = 0;
    initializationModels = [];
    supportedModels = [
      {
        description: "Recommended model.",
        displayName: "Default",
        supportedEffortLevels: ["low", "medium", "high", "max"],
        supportsEffort: true,
        value: "default",
      } as ModelInfo,
      {
        description: "Fast model.",
        displayName: "Haiku",
        supportsEffort: false,
        value: "haiku",
      } as ModelInfo,
    ];
  });

  test("maps supportedModels into the normalized catalog", async () => {
    const catalog = await getClaudeModelCatalog({
      loginMethod: "claudeai",
    });

    expect(catalog.provider).toBe("claude");
    expect(catalog.source).toBe("claude_sdk.supportedModels");
    expect(catalog.defaultModel).toBe("default");
    expect(catalog.models).toEqual([
      {
        defaultReasoningEffort: null,
        description: "Recommended model.",
        label: "Default",
        reasoningEfforts: ["low", "medium", "high", "max"],
        value: "default",
      },
      {
        defaultReasoningEffort: null,
        description: "Fast model.",
        label: "Haiku",
        reasoningEfforts: [],
        value: "haiku",
      },
    ]);
    expect(closeCalls).toBe(1);
  });

  test("falls back to initializationResult when supportedModels is unavailable", async () => {
    supportedModels = null;
    initializationModels = [
      {
        description: "Fallback model.",
        displayName: "Sonnet",
        supportsEffort: true,
        supportedEffortLevels: ["low", "medium", "high"],
        value: "sonnet",
      } as ModelInfo,
    ];

    const catalog = await getClaudeModelCatalog();

    expect(catalog.source).toBe("claude_sdk.initializationResult");
    expect(catalog.models[0]?.value).toBe("sonnet");
    expect(closeCalls).toBe(1);
  });
});
