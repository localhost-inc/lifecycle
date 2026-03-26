import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentActivityBar } from "@/features/agents/components/agent-activity-bar";

describe("AgentActivityBar", () => {
  test("renders queued prompt count when additional messages are waiting", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentActivityBar, {
        elapsedSeconds: 12,
        providerStatus: null,
        queuedMessageCount: 2,
        turnActivity: { phase: "tool_use", toolCallCount: 1, toolName: "command_execution" },
      }),
    );

    expect(markup).toContain("Running command");
    expect(markup).toContain("12s · 2 queued · esc to interrupt");
  });
});
