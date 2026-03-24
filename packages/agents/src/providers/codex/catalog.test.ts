import { beforeEach, describe, expect, mock, test } from "bun:test";

const requestLog: Array<{ method: string; params: Record<string, unknown> | undefined }> = [];
let returnEmptyModelList = false;

class FakeCodexAppServerClient {
  async close(): Promise<void> {}

  async initialize(): Promise<void> {}

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    requestLog.push({ method, params });

    if (method === "account/read") {
      return {
        account: {
          type: "chatgpt",
        },
        requiresOpenaiAuth: true,
      };
    }

    if (method === "model/list") {
      if (returnEmptyModelList) {
        return {
          data: [],
          nextCursor: null,
        };
      }
      if (!params?.cursor) {
        return {
          data: [
            {
              defaultReasoningEffort: "high",
              description: "Latest flagship model.",
              displayName: "GPT-5.4",
              hidden: false,
              isDefault: true,
              model: "gpt-5.4",
              supportedReasoningEfforts: [
                { description: "Fastest", reasoningEffort: "none" },
                { description: "Balanced", reasoningEffort: "medium" },
                { description: "Deep", reasoningEffort: "high" },
              ],
            },
          ],
          nextCursor: "page-2",
        };
      }

      return {
        data: [
          {
            defaultReasoningEffort: "medium",
            description: "Smaller variant.",
            displayName: "GPT-5.4 Mini",
            hidden: false,
            isDefault: false,
            model: "gpt-5.4-mini",
            supportedReasoningEfforts: [{ description: "Balanced", reasoningEffort: "medium" }],
          },
          {
            defaultReasoningEffort: "medium",
            description: "Hidden internal variant.",
            displayName: "Hidden",
            hidden: true,
            isDefault: false,
            model: "hidden-model",
            supportedReasoningEfforts: [],
          },
        ],
        nextCursor: null,
      };
    }

    throw new Error(`Unexpected method ${method}`);
  }
}

mock.module("./app-server", () => ({
  CodexAppServerClient: FakeCodexAppServerClient,
}));

const { getCodexModelCatalog } = await import("./catalog");

describe("codex model catalog", () => {
  beforeEach(() => {
    requestLog.length = 0;
    returnEmptyModelList = false;
  });

  test("reads models from app-server model/list", async () => {
    const catalog = await getCodexModelCatalog();

    expect(catalog.provider).toBe("codex");
    expect(catalog.source).toBe("codex_app_server.chatgpt+model/list");
    expect(catalog.defaultModel).toBe("gpt-5.4");
    expect(catalog.models).toEqual([
      {
        defaultReasoningEffort: "high",
        description: "Latest flagship model.",
        label: "GPT-5.4",
        reasoningEfforts: ["none", "medium", "high"],
        value: "gpt-5.4",
      },
      {
        defaultReasoningEffort: "medium",
        description: "Smaller variant.",
        label: "GPT-5.4 Mini",
        reasoningEfforts: ["medium"],
        value: "gpt-5.4-mini",
      },
    ]);
    expect(requestLog).toEqual([
      { method: "account/read", params: { refreshToken: false } },
      { method: "model/list", params: { includeHidden: false, limit: 100 } },
      { method: "model/list", params: { cursor: "page-2", includeHidden: false, limit: 100 } },
    ]);
  });

  test("surfaces empty model lists explicitly", async () => {
    returnEmptyModelList = true;
    const catalog = await getCodexModelCatalog();

    expect(catalog.defaultModel).toBeNull();
    expect(catalog.models).toEqual([]);
    expect(catalog.warnings).toEqual(["Codex app-server returned no visible models."]);
  });
});
