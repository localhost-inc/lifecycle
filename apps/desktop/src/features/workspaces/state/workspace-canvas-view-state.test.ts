import { describe, expect, test } from "bun:test";
import {
  createAgentTab,
  createDefaultWorkspaceCanvasState,
  readWorkspaceCanvasState,
  writeWorkspaceCanvasState,
} from "@/features/workspaces/state/workspace-canvas-state";

class MemoryStorage {
  #entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.#entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#entries.set(key, value);
  }
}

describe("workspace canvas agent view state", () => {
  test("persists stick-to-bottom tabs across reloads", () => {
    const storage = new MemoryStorage();
    const workspaceId = "workspace-1";
    const agentTab = createAgentTab({
      agentSessionId: "agent-session-1",
      label: "Codex",
      provider: "codex",
    });
    const state = createDefaultWorkspaceCanvasState();

    state.tabsByKey[agentTab.key] = agentTab;
    state.paneTabStateById[state.activePaneId] = {
      activeTabKey: agentTab.key,
      tabOrderKeys: [agentTab.key],
    };
    state.tabStateByKey[agentTab.key] = {
      viewState: {
        stickToBottom: true,
      },
    };

    writeWorkspaceCanvasState(workspaceId, state, storage);

    const restored = readWorkspaceCanvasState(workspaceId, storage);
    expect(restored.tabStateByKey[agentTab.key]?.viewState).toEqual({
      stickToBottom: true,
    });
  });

  test("preserves explicit scroll offsets, including the top of the transcript", () => {
    const storage = new MemoryStorage();
    const workspaceId = "workspace-1";
    const agentTab = createAgentTab({
      agentSessionId: "agent-session-2",
      label: "Claude",
      provider: "claude",
    });
    const state = createDefaultWorkspaceCanvasState();

    state.tabsByKey[agentTab.key] = agentTab;
    state.paneTabStateById[state.activePaneId] = {
      activeTabKey: agentTab.key,
      tabOrderKeys: [agentTab.key],
    };
    state.tabStateByKey[agentTab.key] = {
      viewState: {
        scrollTop: 0,
      },
    };

    writeWorkspaceCanvasState(workspaceId, state, storage);

    const restored = readWorkspaceCanvasState(workspaceId, storage);
    expect(restored.tabStateByKey[agentTab.key]?.viewState).toEqual({
      scrollTop: 0,
    });
  });
});
