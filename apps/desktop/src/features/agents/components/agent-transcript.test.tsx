import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ParsedMessage } from "@/features/agents/components/agent-message-parsing";
import { TranscriptMessage } from "@/features/agents/components/agent-transcript";

function renderTranscriptMessage(message: ParsedMessage): string {
  return renderToStaticMarkup(createElement(TranscriptMessage, { message }));
}

describe("TranscriptMessage", () => {
  test("preserves tool and text ordering within assistant messages", () => {
    const markup = renderTranscriptMessage({
      id: "message_1",
      role: "assistant",
      text: "",
      turnId: "turn_1",
      parts: [
        {
          id: "turn_1:assistant:tool:tool_1",
          part: {
            type: "tool_call",
            toolCallId: "tool_1",
            toolName: "Read",
            inputJson: JSON.stringify({ file_path: "/tmp/config.json" }),
          },
        },
        {
          id: "turn_1:assistant:text:1",
          part: {
            type: "text",
            text: "Checking the workspace context first.",
          },
        },
        {
          id: "turn_1:assistant:tool:tool_2",
          part: {
            type: "tool_call",
            toolCallId: "tool_2",
            toolName: "command_execution",
            inputJson: JSON.stringify({ command: "echo lifecycle" }),
          },
        },
        {
          id: "turn_1:assistant:text:3",
          part: {
            type: "text",
            text: "The CLI isn't resolving the workspace from this terminal session.",
          },
        },
      ],
    });

    const readIndex = markup.indexOf("config.json");
    const firstTextIndex = markup.indexOf("Checking the workspace context first.");
    const shellIndex = markup.indexOf("echo lifecycle");
    const secondTextIndex = markup.indexOf(
      "The CLI isn&#x27;t resolving the workspace from this terminal session.",
    );

    expect(readIndex).toBeGreaterThan(-1);
    expect(firstTextIndex).toBeGreaterThan(readIndex);
    expect(shellIndex).toBeGreaterThan(firstTextIndex);
    expect(secondTextIndex).toBeGreaterThan(shellIndex);
  });

  test("uses stable part ids instead of array indexes for transcript keys", () => {
    const source = readFileSync(new URL("./agent-transcript.tsx", import.meta.url), "utf8");

    expect(source.includes("key={i}")).toBeFalse();
    expect(source.includes("key={id}")).toBeTrue();
    expect(source.includes("key={getAssistantSegmentKey(segment)}")).toBeTrue();
  });
});
