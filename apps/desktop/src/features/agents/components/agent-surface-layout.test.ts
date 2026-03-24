import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("agent-surface transcript layout", () => {
  test("lets transcript rows own their padding instead of the scroll container", () => {
    const source = readFileSync(new URL("./agent-surface.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="bg-[var(--surface-hover)]/50 px-4 py-3"');
    expect(source).toContain('className="px-4 py-3"');
    expect(source).toContain(
      'className="agent-message-list flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"',
    );
    expect(source).not.toContain(
      'className="agent-message-list flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 pb-6 pt-3"',
    );
  });

  test("keeps the input row tighter on the bottom edge", () => {
    const source = readFileSync(new URL("./agent-surface.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="flex items-start px-4 pt-3 pb-2"');
    expect(source).not.toContain('className="flex items-start px-4 py-3"');
  });

  test("renders tool-only assistant rows as a compact log", () => {
    const source = readFileSync(new URL("./agent-surface.tsx", import.meta.url), "utf8");

    expect(source).toContain("function isToolOnlyAssistantMessage");
    expect(source).toContain('className={isToolOnly ? "px-4 py-1.5" : "px-4 py-3"}');
    expect(source).toContain('className="my-0.5"');
  });
});
