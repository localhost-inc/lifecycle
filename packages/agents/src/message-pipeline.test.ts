import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "./events";
import { MessagePipeline } from "./message-pipeline";

// ---------------------------------------------------------------------------
// Helpers — emit sequences of events into a fresh pipeline
// ---------------------------------------------------------------------------

const W = "workspace-1";
const S = "session-1";

function event<K extends AgentEvent["kind"]>(
  kind: K,
  data: Omit<Extract<AgentEvent, { kind: K }>, "kind" | "workspaceId" | "sessionId">,
): Extract<AgentEvent, { kind: K }> {
  return { kind, workspaceId: W, sessionId: S, ...data } as Extract<AgentEvent, { kind: K }>;
}

async function run(events: AgentEvent[], options?: ConstructorParameters<typeof MessagePipeline>[0]) {
  const pipeline = new MessagePipeline(options);
  for (const e of events) {
    await pipeline.processEvent(e);
  }
  return pipeline;
}

// ---------------------------------------------------------------------------
// 1. Simple text response
// ---------------------------------------------------------------------------

describe("simple text response", () => {
  test("single text delta produces assistant message with text", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "Hello world" },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msgs = p.finalMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.id).toBe("t1:assistant");
    expect(msgs[0]!.role).toBe("assistant");
    expect(msgs[0]!.text).toBe("Hello world");
    expect(msgs[0]!.turn_id).toBe("t1");
    expect(msgs[0]!.parts).toHaveLength(1);
    expect(msgs[0]!.parts[0]!.part_type).toBe("text");
    expect(msgs[0]!.parts[0]!.text).toBe("Hello world");
  });

  test("multiple text deltas concatenate into one part", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "Hello " },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "world" },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "!" },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.text).toBe("Hello world!");
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]!.text).toBe("Hello world!");
  });
});

// ---------------------------------------------------------------------------
// 2. Thinking + text
// ---------------------------------------------------------------------------

describe("thinking + text response", () => {
  test("thinking delta followed by text delta produces two parts", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:thinking:0",
        part: { type: "thinking", text: "Let me think..." },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:1",
        part: { type: "text", text: "Here is the answer." },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.text).toBe("Let me think...Here is the answer.");
    expect(msg.parts).toHaveLength(2);
    expect(msg.parts[0]!.part_type).toBe("thinking");
    expect(msg.parts[0]!.text).toBe("Let me think...");
    expect(msg.parts[1]!.part_type).toBe("text");
    expect(msg.parts[1]!.text).toBe("Here is the answer.");
  });

  test("thinking deltas concatenate separately from text deltas", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:thinking:0",
        part: { type: "thinking", text: "Hmm " },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:thinking:0",
        part: { type: "thinking", text: "let me check..." },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:1",
        part: { type: "text", text: "Done." },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.parts[0]!.text).toBe("Hmm let me check...");
    expect(msg.parts[1]!.text).toBe("Done.");
  });
});

// ---------------------------------------------------------------------------
// 3. Tool call sequences
// ---------------------------------------------------------------------------

describe("tool call sequences", () => {
  test("tool_use start + input + completed produces tool_call part", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-1",
        part: { type: "tool_call", toolCallId: "tc-1", toolName: "Read" },
      }),
      event("agent.message.part.completed", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-1",
        part: {
          type: "tool_call",
          toolCallId: "tc-1",
          toolName: "Read",
          inputJson: '{"file_path":"/foo.ts"}',
        },
      }),
      event("agent.message.part.completed", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-1",
        part: {
          type: "tool_call",
          toolCallId: "tc-1",
          toolName: "Read",
          inputJson: '{"file_path":"/foo.ts"}',
          outputJson: '"file contents..."',
          status: "completed",
        },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]!.part_type).toBe("tool_call");
    const data = JSON.parse(msg.parts[0]!.data!);
    expect(data.tool_name).toBe("Read");
    expect(data.status).toBe("completed");
    expect(data.output_json).toBe('"file contents..."');
  });

  test("multiple tool calls produce multiple parts in order", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-1",
        part: { type: "tool_call", toolCallId: "tc-1", toolName: "Grep" },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-2",
        part: { type: "tool_call", toolCallId: "tc-2", toolName: "Read" },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-3",
        part: { type: "tool_call", toolCallId: "tc-3", toolName: "Edit" },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.parts).toHaveLength(3);
    expect(msg.parts[0]!.part_index).toBe(0);
    expect(msg.parts[1]!.part_index).toBe(1);
    expect(msg.parts[2]!.part_index).toBe(2);
    expect(JSON.parse(msg.parts[0]!.data!).tool_name).toBe("Grep");
    expect(JSON.parse(msg.parts[1]!.data!).tool_name).toBe("Read");
    expect(JSON.parse(msg.parts[2]!.data!).tool_name).toBe("Edit");
  });
});

// ---------------------------------------------------------------------------
// 4. Multi-round: text → tools → text
// ---------------------------------------------------------------------------

describe("multi-round turn (text → tools → final text)", () => {
  test("final text after tool calls is preserved", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      // Round 0: initial thinking + text
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:thinking:0:0",
        part: { type: "thinking", text: "Planning..." },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0:1",
        part: { type: "text", text: "Let me check." },
      }),
      // Tool call
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-1",
        part: { type: "tool_call", toolCallId: "tc-1", toolName: "Grep" },
      }),
      event("agent.message.part.completed", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-1",
        part: {
          type: "tool_call",
          toolCallId: "tc-1",
          toolName: "Grep",
          inputJson: '{"pattern":"foo"}',
          outputJson: '"found 3 matches"',
          status: "completed",
        },
      }),
      // Round 1: final text response
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:1:0",
        part: { type: "text", text: "Found " },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:1:0",
        part: { type: "text", text: "it in " },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:1:0",
        part: { type: "text", text: "3 files." },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.parts).toHaveLength(4);
    expect(msg.parts[0]!.part_type).toBe("thinking");
    expect(msg.parts[0]!.text).toBe("Planning...");
    expect(msg.parts[1]!.part_type).toBe("text");
    expect(msg.parts[1]!.text).toBe("Let me check.");
    expect(msg.parts[2]!.part_type).toBe("tool_call");
    expect(msg.parts[3]!.part_type).toBe("text");
    expect(msg.parts[3]!.text).toBe("Found it in 3 files.");
    // Full text concatenates all textual parts
    expect(msg.text).toBe("Planning...Let me check.Found it in 3 files.");
  });

  test("many streaming chunks for final text all concatenate", async () => {
    const chunks = "The quick brown fox jumps over the lazy dog".split(" ");
    const events: AgentEvent[] = [
      event("agent.turn.started", { turnId: "t1" }),
    ];
    for (const [i, word] of chunks.entries()) {
      events.push(
        event("agent.message.part.delta", {
          messageId: "t1:assistant",
          partId: "t1:assistant:text:0:0",
          part: { type: "text", text: i === 0 ? word : ` ${word}` },
        }),
      );
    }
    events.push(event("agent.turn.completed", { turnId: "t1" }));

    const p = await run(events);
    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.text).toBe("The quick brown fox jumps over the lazy dog");
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]!.text).toBe("The quick brown fox jumps over the lazy dog");
  });
});

// ---------------------------------------------------------------------------
// 5. Empty turn → synthetic response
// ---------------------------------------------------------------------------

describe("empty turn completion", () => {
  test("turn with no assistant content creates _No response._ message", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msgs = p.finalMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.id).toBe("t1:assistant");
    expect(msgs[0]!.text).toBe("_No response._");
    expect(msgs[0]!.parts[0]!.part_type).toBe("text");
    expect(msgs[0]!.parts[0]!.text).toBe("_No response._");
  });

  test("turn with content does NOT create synthetic message", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "OK" },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msgs = p.finalMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe("OK");
    // Should NOT have the "_No response._" part
    expect(msgs[0]!.parts).toHaveLength(1);
  });

  test("hasPersistedParts callback prevents synthetic message when parts exist in DB", async () => {
    const p = await run(
      [
        event("agent.turn.started", { turnId: "t1" }),
        event("agent.turn.completed", { turnId: "t1" }),
      ],
      { hasPersistedParts: (msgId) => (msgId === "t1:assistant" ? 3 : 0) },
    );

    // No synthetic message because DB reports parts exist
    const msgs = p.finalMessages();
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Turn failure
// ---------------------------------------------------------------------------

describe("turn failure", () => {
  test("failure evicts accumulated messages for that turn", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "Starting..." },
      }),
      event("agent.turn.failed", { turnId: "t1", error: "connection lost" }),
    ]);

    // The text delta was flushed during streaming
    expect(p.getFlushed("t1:assistant")!.text).toBe("Starting...");
    // But after eviction, snapshot is empty (in-memory cleaned up)
    expect(p.snapshot()).toHaveLength(0);
  });

  test("failure does not create synthetic empty message", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.turn.failed", { turnId: "t1", error: "error" }),
    ]);

    const msgs = p.finalMessages();
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Multi-turn conversation
// ---------------------------------------------------------------------------

describe("multi-turn conversation", () => {
  test("two turns produce separate messages with correct turn_ids", async () => {
    const p = await run([
      // Turn 1
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.created", {
        messageId: "t1:user",
        role: "user",
        turnId: "t1",
      }),
      event("agent.message.part.completed", {
        messageId: "t1:user",
        partId: "t1:user:part:1",
        part: { type: "text", text: "Hello" },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "Hi there!" },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
      // Turn 2
      event("agent.turn.started", { turnId: "t2" }),
      event("agent.message.created", {
        messageId: "t2:user",
        role: "user",
        turnId: "t2",
      }),
      event("agent.message.part.completed", {
        messageId: "t2:user",
        partId: "t2:user:part:1",
        part: { type: "text", text: "What's up?" },
      }),
      event("agent.message.part.delta", {
        messageId: "t2:assistant",
        partId: "t2:assistant:text:0",
        part: { type: "text", text: "Not much!" },
      }),
      event("agent.turn.completed", { turnId: "t2" }),
    ]);

    const msgs = p.finalMessages();
    expect(msgs).toHaveLength(4);
    const userMsgs = msgs.filter((m) => m.role === "user");
    const assistantMsgs = msgs.filter((m) => m.role === "assistant");
    expect(userMsgs).toHaveLength(2);
    expect(assistantMsgs).toHaveLength(2);
    expect(assistantMsgs[0]!.turn_id).toBe("t1");
    expect(assistantMsgs[0]!.text).toBe("Hi there!");
    expect(assistantMsgs[1]!.turn_id).toBe("t2");
    expect(assistantMsgs[1]!.text).toBe("Not much!");
  });

  test("turn eviction only affects that turn's messages", async () => {
    const pipeline = new MessagePipeline();

    // Turn 1 completes
    await pipeline.processEvent(event("agent.turn.started", { turnId: "t1" }));
    await pipeline.processEvent(event("agent.message.part.delta", {
      messageId: "t1:assistant",
      partId: "t1:assistant:text:0",
      part: { type: "text", text: "Reply 1" },
    }));
    await pipeline.processEvent(event("agent.turn.completed", { turnId: "t1" }));

    // Turn 2 starts — t1 messages should be evicted from memory
    await pipeline.processEvent(event("agent.turn.started", { turnId: "t2" }));
    await pipeline.processEvent(event("agent.message.part.delta", {
      messageId: "t2:assistant",
      partId: "t2:assistant:text:0",
      part: { type: "text", text: "Reply 2" },
    }));

    // t1 evicted, t2 still in memory
    const snap = pipeline.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]!.id).toBe("t2:assistant");
  });
});

// ---------------------------------------------------------------------------
// 8. Approval workflow
// ---------------------------------------------------------------------------

describe("approval workflow", () => {
  test("approval request creates system message with pending status", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.approval.requested", {
        approval: {
          id: "apl-1",
          sessionId: S,
          kind: "tool",
          scopeKey: "Read",
          status: "pending",
          message: "Allow Read?",
        },
      }),
    ]);

    const msg = p.getFlushed("approval:apl-1")!;
    expect(msg.role).toBe("system");
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]!.part_type).toBe("approval_ref");
    const data = JSON.parse(msg.parts[0]!.data!);
    expect(data.status).toBe("pending");
    expect(data.approval_id).toBe("apl-1");
  });

  test("approval resolution updates status to approved_once", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.approval.requested", {
        approval: {
          id: "apl-1",
          sessionId: S,
          kind: "tool",
          scopeKey: "Read",
          status: "pending",
          message: "Allow Read?",
        },
      }),
      event("agent.approval.resolved", {
        resolution: {
          approvalId: "apl-1",
          sessionId: S,
          decision: "approve_once",
        },
      }),
    ]);

    const msg = p.getFlushed("approval:apl-1")!;
    const data = JSON.parse(msg.parts[0]!.data!);
    expect(data.status).toBe("approved_once");
    expect(data.decision).toBe("approve_once");
  });

  test("approval rejection sets status to rejected", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.approval.requested", {
        approval: {
          id: "apl-1",
          sessionId: S,
          kind: "shell",
          scopeKey: "Bash",
          status: "pending",
          message: "Allow shell?",
        },
      }),
      event("agent.approval.resolved", {
        resolution: {
          approvalId: "apl-1",
          sessionId: S,
          decision: "reject",
        },
      }),
    ]);

    const msg = p.getFlushed("approval:apl-1")!;
    const data = JSON.parse(msg.parts[0]!.data!);
    expect(data.status).toBe("rejected");
  });
});

// ---------------------------------------------------------------------------
// 9. Tool call updates (synthetic messages)
// ---------------------------------------------------------------------------

describe("tool call updates", () => {
  test("tool_call.updated creates separate tool message", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.tool_call.updated", {
        toolCall: {
          id: "tc-1",
          sessionId: S,
          toolName: "Bash",
          status: "running",
          inputJson: { command: "ls" },
        },
      }),
    ]);

    const msg = p.getFlushed("tool:tc-1")!;
    expect(msg.role).toBe("tool");
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]!.part_type).toBe("tool_call");
  });

  test("tool_call.updated with output creates both call and result parts", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.tool_call.updated", {
        toolCall: {
          id: "tc-1",
          sessionId: S,
          toolName: "Bash",
          status: "completed",
          inputJson: { command: "ls" },
          outputJson: { stdout: "foo.ts\nbar.ts" },
        },
      }),
    ]);

    const msg = p.getFlushed("tool:tc-1")!;
    expect(msg.parts).toHaveLength(2);
    expect(msg.parts[0]!.part_type).toBe("tool_call");
    expect(msg.parts[1]!.part_type).toBe("tool_result");
    const resultData = JSON.parse(msg.parts[1]!.data!);
    expect(JSON.parse(resultData.output_json)).toEqual({ stdout: "foo.ts\nbar.ts" });
  });
});

// ---------------------------------------------------------------------------
// 10. Artifact publishing
// ---------------------------------------------------------------------------

describe("artifacts", () => {
  test("artifact.published creates system message with artifact_ref", async () => {
    const p = await run([
      event("agent.artifact.published", {
        artifact: {
          id: "art-1",
          sessionId: S,
          artifactType: "file",
          title: "Solution",
          uri: "file:///tmp/solution.ts",
        },
      }),
    ]);

    const msg = p.getFlushed("artifact:art-1")!;
    expect(msg.role).toBe("system");
    expect(msg.parts[0]!.part_type).toBe("artifact_ref");
    const data = JSON.parse(msg.parts[0]!.data!);
    expect(data.artifact_id).toBe("art-1");
    expect(data.title).toBe("Solution");
  });
});

// ---------------------------------------------------------------------------
// 11. Role and turn ID inference
// ---------------------------------------------------------------------------

describe("role and turn ID inference", () => {
  test("messageId t1:user → role user, turnId t1", async () => {
    const p = await run([
      event("agent.message.part.delta", {
        messageId: "t1:user",
        partId: "t1:user:text:0",
        part: { type: "text", text: "question" },
      }),
    ]);
    const msg = p.getFlushed("t1:user")!;
    expect(msg.role).toBe("user");
    expect(msg.turn_id).toBe("t1");
  });

  test("messageId t1:assistant → role assistant", async () => {
    const p = await run([
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "answer" },
      }),
    ]);
    expect(p.getFlushed("t1:assistant")!.role).toBe("assistant");
  });

  test("messageId without role segment defaults to assistant", async () => {
    const p = await run([
      event("agent.message.part.delta", {
        messageId: "t1:unknown:foo",
        partId: "t1:unknown:foo:text:0",
        part: { type: "text", text: "x" },
      }),
    ]);
    expect(p.getFlushed("t1:unknown:foo")!.role).toBe("assistant");
  });
});

// ---------------------------------------------------------------------------
// 12. Part index ordering
// ---------------------------------------------------------------------------

describe("part index ordering", () => {
  test("parts are indexed sequentially by insertion order", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:thinking:0",
        part: { type: "thinking", text: "hmm" },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:1",
        part: { type: "text", text: "ok" },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-1",
        part: { type: "tool_call", toolCallId: "tc-1", toolName: "Read" },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:2:0",
        part: { type: "text", text: "done" },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.parts.map((p) => p.part_index)).toEqual([0, 1, 2, 3]);
    expect(msg.parts.map((p) => p.part_type)).toEqual(["thinking", "text", "tool_call", "text"]);
  });
});

// ---------------------------------------------------------------------------
// 13. Flush callback
// ---------------------------------------------------------------------------

describe("flush callback", () => {
  test("onFlush is called for every message write", async () => {
    const flushed: string[] = [];
    await run(
      [
        event("agent.turn.started", { turnId: "t1" }),
        event("agent.message.part.delta", {
          messageId: "t1:assistant",
          partId: "t1:assistant:text:0",
          part: { type: "text", text: "a" },
        }),
        event("agent.message.part.delta", {
          messageId: "t1:assistant",
          partId: "t1:assistant:text:0",
          part: { type: "text", text: "b" },
        }),
        event("agent.turn.completed", { turnId: "t1" }),
      ],
      { onFlush: (msg) => flushed.push(`${msg.id}:${msg.text}`) },
    );

    // Each delta triggers a flush
    expect(flushed).toEqual(["t1:assistant:a", "t1:assistant:ab"]);
  });
});

// ---------------------------------------------------------------------------
// 14. Status parts
// ---------------------------------------------------------------------------

describe("status parts", () => {
  test("status parts are included in text but rendered as status type", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-1:progress",
        part: { type: "status", text: "Bash (3s)" },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:1:0",
        part: { type: "text", text: "Done." },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.parts[0]!.part_type).toBe("status");
    expect(msg.parts[1]!.part_type).toBe("text");
    expect(msg.text).toBe("Bash (3s)Done.");
  });
});

// ---------------------------------------------------------------------------
// 15. Large streaming scenario (Claude-like)
// ---------------------------------------------------------------------------

describe("Claude-like full conversation", () => {
  test("realistic multi-turn with thinking, tools, and streaming text", async () => {
    const events: AgentEvent[] = [
      // ── Turn 1: user asks, agent thinks + responds briefly ──
      event("agent.turn.started", { turnId: "turn-1" }),
      event("agent.message.created", {
        messageId: "turn-1:user",
        role: "user",
        turnId: "turn-1",
      }),
      event("agent.message.part.completed", {
        messageId: "turn-1:user",
        partId: "turn-1:user:part:1",
        part: { type: "text", text: "Fix the bug in auth.ts" },
      }),
      // Thinking
      event("agent.message.part.delta", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:thinking:0:0",
        part: { type: "thinking", text: "I need to find " },
      }),
      event("agent.message.part.delta", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:thinking:0:0",
        part: { type: "thinking", text: "the auth bug." },
      }),
      // Initial text
      event("agent.message.part.delta", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:text:0:1",
        part: { type: "text", text: "Let me look at auth.ts." },
      }),
      // Tool: Grep
      event("agent.message.part.delta", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:tool:grep-1",
        part: { type: "tool_call", toolCallId: "grep-1", toolName: "Grep" },
      }),
      event("agent.message.part.completed", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:tool:grep-1",
        part: {
          type: "tool_call",
          toolCallId: "grep-1",
          toolName: "Grep",
          inputJson: '{"pattern":"auth"}',
          outputJson: '"found in src/auth.ts:42"',
          status: "completed",
        },
      }),
      // Tool: Read
      event("agent.message.part.delta", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:tool:read-1",
        part: { type: "tool_call", toolCallId: "read-1", toolName: "Read" },
      }),
      event("agent.message.part.completed", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:tool:read-1",
        part: {
          type: "tool_call",
          toolCallId: "read-1",
          toolName: "Read",
          inputJson: '{"file_path":"src/auth.ts"}',
          outputJson: '"const token = getToken();"',
          status: "completed",
        },
      }),
      // Tool: Edit
      event("agent.message.part.delta", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:tool:edit-1",
        part: { type: "tool_call", toolCallId: "edit-1", toolName: "Edit" },
      }),
      event("agent.message.part.completed", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:tool:edit-1",
        part: {
          type: "tool_call",
          toolCallId: "edit-1",
          toolName: "Edit",
          inputJson: '{"file_path":"src/auth.ts","old_string":"getToken()","new_string":"getToken(true)"}',
          status: "completed",
        },
      }),
      // Final text response (streamed in many chunks)
      event("agent.message.part.delta", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:text:1:0",
        part: { type: "text", text: "I found " },
      }),
      event("agent.message.part.delta", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:text:1:0",
        part: { type: "text", text: "and fixed " },
      }),
      event("agent.message.part.delta", {
        messageId: "turn-1:assistant",
        partId: "turn-1:assistant:text:1:0",
        part: { type: "text", text: "the bug." },
      }),
      event("agent.turn.completed", {
        turnId: "turn-1",
        usage: { inputTokens: 5000, outputTokens: 200, cacheReadTokens: 1000 },
        costUsd: 0.05,
      }),
    ];

    const p = await run(events);
    const msgs = p.finalMessages();

    // Should have: user message + assistant message
    expect(msgs).toHaveLength(2);

    const userMsg = msgs.find((m) => m.role === "user")!;
    expect(userMsg.text).toBe("Fix the bug in auth.ts");
    expect(userMsg.turn_id).toBe("turn-1");
    expect(userMsg.parts).toHaveLength(1);

    const assistantMsg = msgs.find((m) => m.role === "assistant")!;
    expect(assistantMsg.turn_id).toBe("turn-1");

    // Parts in order: thinking, text, grep, read, edit, final text
    expect(assistantMsg.parts.map((p) => p.part_type)).toEqual([
      "thinking",
      "text",
      "tool_call",
      "tool_call",
      "tool_call",
      "text",
    ]);

    // Thinking accumulated
    expect(assistantMsg.parts[0]!.text).toBe("I need to find the auth bug.");

    // Initial text
    expect(assistantMsg.parts[1]!.text).toBe("Let me look at auth.ts.");

    // Final text — all 3 streaming chunks concatenated
    expect(assistantMsg.parts[5]!.text).toBe("I found and fixed the bug.");

    // Full message text concatenates all textual parts
    expect(assistantMsg.text).toBe(
      "I need to find the auth bug.Let me look at auth.ts.I found and fixed the bug.",
    );

    // Tool calls have data
    for (let i = 2; i <= 4; i++) {
      expect(assistantMsg.parts[i]!.data).not.toBeNull();
      expect(assistantMsg.parts[i]!.part_type).toBe("tool_call");
    }
  });
});

// ---------------------------------------------------------------------------
// 16. Codex-like item events
// ---------------------------------------------------------------------------

describe("Codex-like item events", () => {
  test("command_execution item produces tool_call part with command data", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.completed", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:cmd-1",
        part: {
          type: "tool_call",
          toolCallId: "cmd-1",
          toolName: "command_execution",
          inputJson: '{"command":"npm test"}',
          outputJson: '{"command":"npm test","exitCode":0,"stdout":"all pass"}',
          status: "completed",
        },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "Tests passed!" },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.parts).toHaveLength(2);
    expect(msg.parts[0]!.part_type).toBe("tool_call");
    expect(msg.parts[1]!.part_type).toBe("text");
    expect(msg.parts[1]!.text).toBe("Tests passed!");
  });
});

// ---------------------------------------------------------------------------
// 17. Part replacement (completed replaces delta)
// ---------------------------------------------------------------------------

describe("part replacement", () => {
  test("completed event replaces delta for same partId", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      // Delta starts a tool call (no input yet)
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-1",
        part: { type: "tool_call", toolCallId: "tc-1", toolName: "Read" },
      }),
      // Completed replaces with full data
      event("agent.message.part.completed", {
        messageId: "t1:assistant",
        partId: "t1:assistant:tool:tc-1",
        part: {
          type: "tool_call",
          toolCallId: "tc-1",
          toolName: "Read",
          inputJson: '{"path":"/foo"}',
          outputJson: '"contents"',
          status: "completed",
        },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    // Only one part (replaced, not duplicated)
    expect(msg.parts).toHaveLength(1);
    const data = JSON.parse(msg.parts[0]!.data!);
    expect(data.status).toBe("completed");
    expect(data.output_json).toBe('"contents"');
  });
});

// ---------------------------------------------------------------------------
// 18. User message with images
// ---------------------------------------------------------------------------

describe("user message with images", () => {
  test("user message with text and image parts", async () => {
    const p = await run([
      event("agent.message.created", {
        messageId: "t1:user",
        role: "user",
        turnId: "t1",
      }),
      event("agent.message.part.completed", {
        messageId: "t1:user",
        partId: "t1:user:part:1",
        part: { type: "text", text: "What is this?" },
      }),
      event("agent.message.part.completed", {
        messageId: "t1:user",
        partId: "t1:user:part:2",
        part: { type: "image", mediaType: "image/png", base64Data: "iVBOR..." },
      }),
    ]);

    const msg = p.getFlushed("t1:user")!;
    expect(msg.role).toBe("user");
    expect(msg.parts).toHaveLength(2);
    expect(msg.parts[0]!.part_type).toBe("text");
    expect(msg.parts[1]!.part_type).toBe("image");
    expect(msg.parts[1]!.data).not.toBeNull();
    const imgData = JSON.parse(msg.parts[1]!.data!);
    expect(imgData.media_type).toBe("image/png");
  });
});

// ---------------------------------------------------------------------------
// 19. Edge case: empty text deltas
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  test("empty text delta still creates a part", async () => {
    const p = await run([
      event("agent.turn.started", { turnId: "t1" }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "" },
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "Hello" },
      }),
      event("agent.turn.completed", { turnId: "t1" }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]!.text).toBe("Hello");
    expect(msg.text).toBe("Hello");
  });

  test("message.created before deltas sets role correctly", async () => {
    const p = await run([
      event("agent.message.created", {
        messageId: "t1:assistant",
        role: "assistant",
        turnId: "t1",
      }),
      event("agent.message.part.delta", {
        messageId: "t1:assistant",
        partId: "t1:assistant:text:0",
        part: { type: "text", text: "Hello" },
      }),
    ]);

    const msg = p.getFlushed("t1:assistant")!;
    expect(msg.role).toBe("assistant");
    // First flush is the empty message.created, second has the text
    const allFlushes = p.allFlushed().filter((m) => m.id === "t1:assistant");
    expect(allFlushes).toHaveLength(2);
    expect(allFlushes[0]!.text).toBe("");
    expect(allFlushes[1]!.text).toBe("Hello");
  });

  test("ignores events that don't affect messages", async () => {
    const p = await run([
      event("agent.status.updated", { status: "thinking", detail: null }),
      event("agent.auth.updated", { provider: "claude", authenticated: true }),
    ]);

    expect(p.finalMessages()).toHaveLength(0);
    expect(p.allFlushed()).toHaveLength(0);
  });
});
