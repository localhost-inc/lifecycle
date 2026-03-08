import { describe, expect, test } from "bun:test";
import { notifyShellResizeListeners, subscribeToShellResize } from "./shell-resize-provider";

describe("shell resize notifications", () => {
  test("replays the current resize state to late subscribers", () => {
    notifyShellResizeListeners(false);

    const firstSubscriberStates: boolean[] = [];
    const unsubscribeFirst = subscribeToShellResize((resizing) => {
      firstSubscriberStates.push(resizing);
    });

    expect(firstSubscriberStates).toEqual([false]);

    notifyShellResizeListeners(true);

    const secondSubscriberStates: boolean[] = [];
    const unsubscribeSecond = subscribeToShellResize((resizing) => {
      secondSubscriberStates.push(resizing);
    });

    expect(firstSubscriberStates).toEqual([false, true]);
    expect(secondSubscriberStates).toEqual([true]);

    notifyShellResizeListeners(false);

    expect(firstSubscriberStates).toEqual([false, true, false]);
    expect(secondSubscriberStates).toEqual([true, false]);

    unsubscribeFirst();
    unsubscribeSecond();
    notifyShellResizeListeners(false);
  });
});
