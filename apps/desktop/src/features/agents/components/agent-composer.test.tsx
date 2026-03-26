import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentComposer } from "@/features/agents/components/agent-composer";

function renderComposer(): string {
  return renderToStaticMarkup(
    createElement(AgentComposer, {
      layout: "centered",
      prompt: {
        agentSessionId: "session_1",
        commandItems: [],
        draftPrompt: "",
        error: null,
        fileItems: [],
        isRunning: false,
        onAddImagesFromFiles() {},
        onDismissQueuedPrompt() {},
        onDraftPromptChange() {},
        onRemovePendingImage() {},
        onRetryQueuedPrompt() {},
        onSend() {},
        pendingImages: [],
        planMode: false,
        queuedPrompts: [],
      },
      toolbar: {
        catalogError: null,
        catalogLoading: false,
        displayStatus: "idle",
        model: {
          onChange() {},
          options: [{ id: "model_1", label: "Model 1" }],
          selected: "model_1",
        },
        permissions: {
          onChange() {},
          options: [{ id: "permissions_1", label: "Workspace Write" }],
          selected: "permissions_1",
        },
        providerName: "claude",
        ProviderIcon() {
          return null;
        },
        reasoning: {
          onChange() {},
          options: [{ id: "reasoning_1", label: "Medium" }],
          selected: "reasoning_1",
        },
        responseReady: false,
        usage: {
          cacheReadTokens: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
      },
      toolbarClassName: "mt-2",
    }),
  );
}

describe("AgentComposer", () => {
  test("renders the prompt input and toolbar as a single stack", () => {
    const markup = renderComposer();

    expect(markup).toContain('rows="2"');
    expect(markup).toContain("Workspace Write");
    expect(markup).toContain("Idle");
    expect(markup).toContain("mt-2");
    expect(markup.indexOf('rows="2"')).toBeLessThan(markup.indexOf("Workspace Write"));
  });
});
