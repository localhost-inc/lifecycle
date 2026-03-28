import { describe, expect, test } from "bun:test";
import {
  beginAgentPromptDispatch,
  buildAgentPromptPreview,
  completeAgentPromptDispatch,
  createAgentPromptQueueStore,
  createAgentQueuedPrompt,
  dismissAgentPrompt,
  enqueueAgentPrompt,
  failAgentPromptDispatch,
  resolveAgentPromptDispatchDecision,
  retryAgentPrompt,
  selectAgentPromptQueueState,
  selectQueuedAgentPromptCount,
} from "./prompt-queue";

describe("agent prompt queue store", () => {
  test("builds prompt previews from text and attachments", () => {
    expect(
      buildAgentPromptPreview([
        { type: "text", text: "Run the migrations after that." },
        { type: "image", mediaType: "image/png", base64Data: "abc" },
        { type: "image", mediaType: "image/png", base64Data: "def" },
      ]),
    ).toEqual({
      attachmentSummary: "2 images",
      text: "Run the migrations after that.",
    });
  });

  test("claims a prompt for dispatch and excludes it from queued counts", () => {
    let state = createAgentPromptQueueStore();
    state = enqueueAgentPrompt(state, {
      prompt: createAgentQueuedPrompt({
        id: "prompt_1",
        input: [{ type: "text", text: "First" }],
      }),
      sessionId: "session_1",
    });
    state = enqueueAgentPrompt(state, {
      prompt: createAgentQueuedPrompt({
        id: "prompt_2",
        input: [{ type: "text", text: "Second" }],
      }),
      sessionId: "session_1",
    });

    const claimed = beginAgentPromptDispatch(state, {
      promptId: "prompt_1",
      sessionId: "session_1",
    });

    expect(claimed.prompt?.id).toBe("prompt_1");
    expect(selectAgentPromptQueueState(claimed.state, "session_1")).toEqual({
      dispatchingPromptId: "prompt_1",
      prompts: [
        expect.objectContaining({ id: "prompt_1" }),
        expect.objectContaining({ id: "prompt_2" }),
      ],
    });
    expect(selectQueuedAgentPromptCount(claimed.state, "session_1")).toBe(1);
  });

  test("marks dispatch failures for retry and clears the dispatch slot", () => {
    let state = createAgentPromptQueueStore();
    state = enqueueAgentPrompt(state, {
      prompt: createAgentQueuedPrompt({
        id: "prompt_1",
        input: [{ type: "text", text: "First" }],
      }),
      sessionId: "session_1",
    });
    state = beginAgentPromptDispatch(state, {
      promptId: "prompt_1",
      sessionId: "session_1",
    }).state;

    state = failAgentPromptDispatch(state, {
      error: "Failed to send prompt.",
      promptId: "prompt_1",
      sessionId: "session_1",
    });

    expect(selectAgentPromptQueueState(state, "session_1")).toEqual({
      dispatchingPromptId: null,
      prompts: [expect.objectContaining({ error: "Failed to send prompt.", id: "prompt_1" })],
    });

    state = retryAgentPrompt(state, {
      promptId: "prompt_1",
      sessionId: "session_1",
    });

    expect(selectAgentPromptQueueState(state, "session_1")).toEqual({
      dispatchingPromptId: null,
      prompts: [expect.objectContaining({ error: null, id: "prompt_1" })],
    });
  });

  test("removes completed or dismissed prompts from the session queue", () => {
    let state = createAgentPromptQueueStore();
    state = enqueueAgentPrompt(state, {
      prompt: createAgentQueuedPrompt({
        id: "prompt_1",
        input: [{ type: "text", text: "First" }],
      }),
      sessionId: "session_1",
    });
    state = beginAgentPromptDispatch(state, {
      promptId: "prompt_1",
      sessionId: "session_1",
    }).state;

    state = completeAgentPromptDispatch(state, {
      promptId: "prompt_1",
      sessionId: "session_1",
    });
    state = enqueueAgentPrompt(state, {
      prompt: createAgentQueuedPrompt({
        id: "prompt_2",
        input: [{ type: "text", text: "Second" }],
      }),
      sessionId: "session_1",
    });
    state = dismissAgentPrompt(state, {
      promptId: "prompt_2",
      sessionId: "session_1",
    });

    expect(selectAgentPromptQueueState(state, "session_1")).toEqual({
      dispatchingPromptId: null,
      prompts: [],
    });
  });

  test("holds or dispatches based on active session state", () => {
    expect(
      resolveAgentPromptDispatchDecision({
        activeTurnId: null,
        hasPendingApprovals: false,
        provider: "claude",
      }),
    ).toEqual({ type: "dispatch_turn" });

    expect(
      resolveAgentPromptDispatchDecision({
        activeTurnId: "turn_1",
        hasPendingApprovals: false,
        provider: "codex",
      }),
    ).toEqual({
      reason: "active_turn",
      type: "hold",
    });
  });
});
