import { describe, expect, test } from "bun:test";
import {
  claimNativeTerminalSurfaceLease,
  createNativeTerminalSurfaceLeaseRegistry,
  resolveNativeTerminalSurfaceSyncResultAction,
  resolveNativeTerminalSurfaceInteraction,
  scheduleNativeTerminalSurfaceLeaseHide,
  shouldHideNativeTerminalSurfaceForTabDrag,
  shouldShowNativeTerminalSurface,
} from "./native-terminal-surface";

describe("shouldShowNativeTerminalSurface", () => {
  test("requires a live session with measurable bounds", () => {
    expect(
      shouldShowNativeTerminalSurface({
        hasLiveSession: true,
        height: 640,
        width: 960,
      }),
    ).toBeTrue();
    expect(
      shouldShowNativeTerminalSurface({
        hasLiveSession: false,
        height: 640,
        width: 960,
      }),
    ).toBeFalse();
    expect(
      shouldShowNativeTerminalSurface({
        hasLiveSession: true,
        height: 1,
        width: 960,
      }),
    ).toBeFalse();
  });
});

describe("resolveNativeTerminalSurfaceInteraction", () => {
  test("keeps the native surface visible but non-interactive during shell drags", () => {
    expect(
      resolveNativeTerminalSurfaceInteraction({
        focused: true,
        shellResizeInProgress: true,
        visible: true,
      }),
    ).toEqual({
      focused: false,
      pointerPassthrough: true,
    });
  });

  test("restores focus when shell dragging is inactive", () => {
    expect(
      resolveNativeTerminalSurfaceInteraction({
        focused: true,
        shellResizeInProgress: false,
        visible: true,
      }),
    ).toEqual({
      focused: true,
      pointerPassthrough: false,
    });
  });

  test("keeps background terminals visible but click-through", () => {
    expect(
      resolveNativeTerminalSurfaceInteraction({
        focused: false,
        shellResizeInProgress: false,
        visible: true,
      }),
    ).toEqual({
      focused: false,
      pointerPassthrough: true,
    });
  });
});

describe("shouldHideNativeTerminalSurfaceForTabDrag", () => {
  test("hides the native surface while a tab drag is active over a live terminal pane", () => {
    expect(
      shouldHideNativeTerminalSurfaceForTabDrag({
        hasLiveSession: true,
        height: 640,
        tabDragInProgress: true,
        width: 960,
      }),
    ).toBeTrue();
  });

  test("keeps the native surface eligible when the pane cannot show a live session", () => {
    expect(
      shouldHideNativeTerminalSurfaceForTabDrag({
        hasLiveSession: false,
        height: 640,
        tabDragInProgress: true,
        width: 960,
      }),
    ).toBeFalse();
    expect(
      shouldHideNativeTerminalSurfaceForTabDrag({
        hasLiveSession: true,
        height: 1,
        tabDragInProgress: true,
        width: 960,
      }),
    ).toBeFalse();
  });
});

describe("native terminal lease coordination", () => {
  test("claiming a lease cancels a pending hide for the same terminal", () => {
    const registry = createNativeTerminalSurfaceLeaseRegistry();
    const cancelledFrameIds: number[] = [];

    registry.set("term-1", {
      owner: Symbol("previous"),
      pendingHideFrameId: 42,
    });

    claimNativeTerminalSurfaceLease(registry, "term-1", Symbol("next"), (frameId) => {
      cancelledFrameIds.push(frameId);
    });

    expect(cancelledFrameIds).toEqual([42]);
    expect(registry.get("term-1")?.pendingHideFrameId).toBeNull();
  });

  test("a stale owner cannot schedule a hide after another owner claims the terminal", () => {
    const registry = createNativeTerminalSurfaceLeaseRegistry();
    const ownerA = Symbol("owner-a");
    const ownerB = Symbol("owner-b");

    claimNativeTerminalSurfaceLease(registry, "term-1", ownerA, () => {});
    claimNativeTerminalSurfaceLease(registry, "term-1", ownerB, () => {});

    const scheduled = scheduleNativeTerminalSurfaceLeaseHide(
      registry,
      "term-1",
      ownerA,
      () => 7,
      () => {},
      () => {},
    );

    expect(scheduled).toBeNull();
    expect(registry.get("term-1")?.owner).toBe(ownerB);
  });

  test("a replacement owner prevents a previously scheduled hide from running", () => {
    const registry = createNativeTerminalSurfaceLeaseRegistry();
    const ownerA = Symbol("owner-a");
    const ownerB = Symbol("owner-b");
    let scheduledCallback: ((timestamp: number) => void) | null = null;
    const hiddenTerminalIds: string[] = [];
    const cancelledFrameIds: number[] = [];

    claimNativeTerminalSurfaceLease(registry, "term-1", ownerA, () => {});
    const scheduled = scheduleNativeTerminalSurfaceLeaseHide(
      registry,
      "term-1",
      ownerA,
      (callback) => {
        scheduledCallback = callback;
        return 11;
      },
      (frameId) => {
        cancelledFrameIds.push(frameId);
      },
      (terminalId) => {
        hiddenTerminalIds.push(terminalId);
      },
    );

    claimNativeTerminalSurfaceLease(registry, "term-1", ownerB, (frameId) => {
      cancelledFrameIds.push(frameId);
    });
    const replacementHideCallback = scheduledCallback as unknown as (timestamp: number) => void;
    replacementHideCallback(0);

    expect(scheduled).toBe(11);
    expect(cancelledFrameIds).toEqual([11]);
    expect(hiddenTerminalIds).toEqual([]);
    expect(registry.get("term-1")?.owner).toBe(ownerB);
  });

  test("re-claiming with the same owner cancels a rerender hide but preserves final unmount cleanup", () => {
    const registry = createNativeTerminalSurfaceLeaseRegistry();
    const owner = Symbol("owner");
    const cancelledFrameIds: number[] = [];
    const hiddenTerminalIds: string[] = [];
    let firstScheduledCallback: ((timestamp: number) => void) | null = null;
    let finalScheduledCallback: ((timestamp: number) => void) | null = null;

    claimNativeTerminalSurfaceLease(registry, "term-1", owner, () => {});
    scheduleNativeTerminalSurfaceLeaseHide(
      registry,
      "term-1",
      owner,
      (callback) => {
        firstScheduledCallback = callback;
        return 23;
      },
      (frameId) => {
        cancelledFrameIds.push(frameId);
      },
      (terminalId) => {
        hiddenTerminalIds.push(terminalId);
      },
    );

    claimNativeTerminalSurfaceLease(registry, "term-1", owner, (frameId) => {
      cancelledFrameIds.push(frameId);
    });
    const rerenderHideCallback = firstScheduledCallback as unknown as (timestamp: number) => void;
    rerenderHideCallback(0);

    expect(cancelledFrameIds).toEqual([23]);
    expect(hiddenTerminalIds).toEqual([]);
    expect(registry.get("term-1")).toEqual({
      owner,
      pendingHideFrameId: null,
    });

    scheduleNativeTerminalSurfaceLeaseHide(
      registry,
      "term-1",
      owner,
      (callback) => {
        finalScheduledCallback = callback;
        return 29;
      },
      (frameId) => {
        cancelledFrameIds.push(frameId);
      },
      (terminalId) => {
        hiddenTerminalIds.push(terminalId);
      },
    );
    const finalHideCallback = finalScheduledCallback as unknown as (timestamp: number) => void;
    finalHideCallback(0);

    expect(cancelledFrameIds).toEqual([23]);
    expect(hiddenTerminalIds).toEqual(["term-1"]);
    expect(registry.has("term-1")).toBeFalse();
  });

  test("the final owner unmount still hides the terminal", () => {
    const registry = createNativeTerminalSurfaceLeaseRegistry();
    const owner = Symbol("owner");
    let scheduledCallback: ((timestamp: number) => void) | null = null;
    const hiddenTerminalIds: string[] = [];

    claimNativeTerminalSurfaceLease(registry, "term-1", owner, () => {});
    scheduleNativeTerminalSurfaceLeaseHide(
      registry,
      "term-1",
      owner,
      (callback) => {
        scheduledCallback = callback;
        return 19;
      },
      () => {},
      (terminalId) => {
        hiddenTerminalIds.push(terminalId);
      },
    );
    const finalHideCallback = scheduledCallback as unknown as (timestamp: number) => void;
    finalHideCallback(0);

    expect(hiddenTerminalIds).toEqual(["term-1"]);
    expect(registry.has("term-1")).toBeFalse();
  });
});

describe("resolveNativeTerminalSurfaceSyncResultAction", () => {
  test("applies the sync result while the same surface lifetime is active", () => {
    const registry = createNativeTerminalSurfaceLeaseRegistry();

    expect(
      resolveNativeTerminalSurfaceSyncResultAction({
        currentLifecycleToken: 4,
        lifecycleToken: 4,
        registry,
        terminalId: "term-1",
      }),
    ).toBe("apply");
  });

  test("hides a stale sync result after the terminal lease has been released", () => {
    const registry = createNativeTerminalSurfaceLeaseRegistry();

    expect(
      resolveNativeTerminalSurfaceSyncResultAction({
        currentLifecycleToken: 5,
        lifecycleToken: 4,
        registry,
        terminalId: "term-1",
      }),
    ).toBe("hide");
  });

  test("ignores a stale sync result when another lease still owns the terminal", () => {
    const registry = createNativeTerminalSurfaceLeaseRegistry();

    registry.set("term-1", {
      owner: Symbol("replacement"),
      pendingHideFrameId: null,
    });

    expect(
      resolveNativeTerminalSurfaceSyncResultAction({
        currentLifecycleToken: 6,
        lifecycleToken: 4,
        registry,
        terminalId: "term-1",
      }),
    ).toBe("ignore");
  });
});
