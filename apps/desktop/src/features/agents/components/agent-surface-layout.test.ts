import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("agent-surface transcript layout", () => {
  test("lets transcript rows own their padding instead of the scroll container", () => {
    const surfaceSource = readFileSync(new URL("./agent-surface.tsx", import.meta.url), "utf8");
    const transcriptSource = readFileSync(new URL("./agent-transcript.tsx", import.meta.url), "utf8");

    expect(transcriptSource).toContain('className="bg-[var(--surface-hover)]/50 px-4 py-3"');
    expect(surfaceSource).toContain('className="px-4 py-3 text-[13px]');
    expect(surfaceSource).toContain(
      'className="agent-message-list relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"',
    );
    expect(surfaceSource).not.toContain(
      'className="agent-message-list flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 pb-6 pt-3"',
    );
  });

  test("keeps the input row tighter on the bottom edge", () => {
    const source = readFileSync(new URL("./agent-prompt-input.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="flex cursor-text items-start px-4 pt-3 pb-2"');
    expect(source).not.toContain('className="flex items-start px-4 py-3"');
  });

  test("tabs stay mounted — no scroll save/restore needed", () => {
    const source = readFileSync(new URL("./agent-surface.tsx", import.meta.url), "utf8");

    // Tabs stay mounted across switches so DOM preserves scroll position.
    // No manual scrollTop restoration or persistence should exist.
    expect(source).not.toContain("viewport.scrollTop = initialScrollTop");
    expect(source).not.toContain("persistViewState");
    expect(source).not.toContain("initialStickToBottom");
  });

  test("renders tool-only assistant rows as a compact log", () => {
    const transcriptSource = readFileSync(new URL("./agent-transcript.tsx", import.meta.url), "utf8");
    const partSource = readFileSync(new URL("./parts/tool-call-part.tsx", import.meta.url), "utf8");

    expect(transcriptSource).toContain("function isToolOnlyAssistantMessage");
    expect(transcriptSource).toContain('className={isToolOnly ? "px-4 py-1.5" : "px-4 py-3"}');
    expect(partSource).toContain('className={["my-0.5 transition-opacity", isCompleted ? "opacity-50" : ""].join(" ")}');
  });
});
