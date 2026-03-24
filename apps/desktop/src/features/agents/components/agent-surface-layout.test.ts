import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("agent-surface transcript layout", () => {
  test("lets transcript rows own their padding instead of the scroll container", () => {
    const surfaceSource = readFileSync(new URL("./agent-surface.tsx", import.meta.url), "utf8");
    const transcriptSource = readFileSync(new URL("./agent-transcript.tsx", import.meta.url), "utf8");

    expect(transcriptSource).toContain('className="bg-[var(--surface-hover)]/50 px-4 py-3"');
    expect(surfaceSource).toContain('className="px-4 py-3"');
    expect(surfaceSource).toContain(
      'className="agent-message-list flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"',
    );
    expect(surfaceSource).not.toContain(
      'className="agent-message-list flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 pb-6 pt-3"',
    );
  });

  test("keeps the input row tighter on the bottom edge", () => {
    const source = readFileSync(new URL("./agent-surface.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="flex items-start px-4 pt-3 pb-2"');
    expect(source).not.toContain('className="flex items-start px-4 py-3"');
  });

  test("renders tool-only assistant rows as a compact log", () => {
    const transcriptSource = readFileSync(new URL("./agent-transcript.tsx", import.meta.url), "utf8");
    const partSource = readFileSync(new URL("./parts/tool-call-part.tsx", import.meta.url), "utf8");

    expect(transcriptSource).toContain("function isToolOnlyAssistantMessage");
    expect(transcriptSource).toContain('className={isToolOnly ? "px-4 py-1.5" : "px-4 py-3"}');
    expect(partSource).toContain('className="my-0.5"');
  });
});
