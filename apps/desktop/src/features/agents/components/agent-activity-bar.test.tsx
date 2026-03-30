import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentActivityBar } from "@/features/agents/components/agent-activity-bar";

describe("AgentActivityBar", () => {
  test("renders queued prompt count when additional messages are waiting", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentActivityBar, {
        queuedMessageCount: 2,
        turnActivity: { phase: "tool_use", toolCallCount: 1, toolName: "command_execution" },
        visible: true,
      }),
    );

    expect(markup).toContain("Running command");
    expect(markup).toContain("2 queued · esc to interrupt");
    expect(markup).toContain('data-slot="logo"');
    expect(markup).toContain("lifecycle-motion-soft-pulse");
  });
});
