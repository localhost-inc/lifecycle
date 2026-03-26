import { describe, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPromptInput } from "@/features/agents/components/agent-prompt-input";

function renderPromptInput(props?: Partial<ComponentProps<typeof AgentPromptInput>>): string {
  return renderToStaticMarkup(
    createElement(AgentPromptInput, {
      agentSessionId: "session_1",
      commandItems: [],
      draftPrompt: "",
      error: null,
      fileItems: [],
      isRunning: false,
      layout: "docked",
      onAddImagesFromFiles() {},
      onDismissQueuedPrompt() {},
      onDraftPromptChange() {},
      onRemovePendingImage() {},
      onRetryQueuedPrompt() {},
      onSend() {},
      pendingImages: [],
      planMode: false,
      queuedPrompts: [],
      ...props,
    }),
  );
}

describe("AgentPromptInput", () => {
  test("renders queued prompt previews above the composer", () => {
    const markup = renderPromptInput({
      queuedPrompts: [
        {
          attachmentSummary: "2 images",
          error: null,
          id: "queued_1",
          text: "Run the migrations after that.",
        },
      ],
    });

    expect(markup).toContain("Run the migrations after that.");
    expect(markup).toContain("2 images");
  });

  test("renders retry controls for a failed queued prompt", () => {
    const markup = renderPromptInput({
      queuedPrompts: [
        {
          attachmentSummary: null,
          error: "Failed to send prompt.",
          id: "queued_1",
          text: "Run the migrations after that.",
        },
      ],
    });

    expect(markup).toContain("Failed to send prompt.");
    expect(markup).toContain("Retry");
    expect(markup).toContain("Dismiss");
  });

  test("supports a centered first-message layout with a taller composer", () => {
    const markup = renderPromptInput({ layout: "centered" });

    expect(markup).toContain("bg-[var(--surface-hover)]/50");
    expect(markup).not.toContain("rounded-2xl");
    expect(markup).toContain('rows="2"');
  });
});
