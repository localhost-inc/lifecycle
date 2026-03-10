import { afterEach, describe, expect, test } from "bun:test";
import { readOverlayViewportSnapshot, subscribeOverlayViewport } from "./overlay-viewport";

type WindowStub = Pick<
  Window,
  "addEventListener" | "removeEventListener"
> & {
  innerHeight: number;
  innerWidth: number;
  visualViewport: Pick<VisualViewport, "addEventListener" | "removeEventListener"> | null;
};

const originalWindow = globalThis.window;

function installWindowStub(windowStub: WindowStub): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub as unknown as Window,
  });
}

describe("overlay viewport", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  test("reads the latest window size from each snapshot", () => {
    const windowStub: WindowStub = {
      addEventListener() {},
      innerHeight: 480,
      innerWidth: 640,
      removeEventListener() {},
      visualViewport: null,
    };

    installWindowStub(windowStub);
    const firstSnapshot = readOverlayViewportSnapshot();
    expect(firstSnapshot).toEqual({ height: 480, width: 640 });
    expect(readOverlayViewportSnapshot()).toBe(firstSnapshot);

    windowStub.innerWidth = 1200;
    windowStub.innerHeight = 720;
    const secondSnapshot = readOverlayViewportSnapshot();
    expect(secondSnapshot).toEqual({ height: 720, width: 1200 });
    expect(secondSnapshot).not.toBe(firstSnapshot);
  });

  test("subscribes to both window and visual viewport resize events", () => {
    const windowListeners = new Set<EventListenerOrEventListenerObject>();
    const visualViewportListeners = new Set<EventListenerOrEventListenerObject>();
    const visualViewport = {
      addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
        visualViewportListeners.add(listener);
      },
      removeEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
        visualViewportListeners.delete(listener);
      },
    } satisfies WindowStub["visualViewport"];

    installWindowStub({
      addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
        windowListeners.add(listener);
      },
      innerHeight: 480,
      innerWidth: 640,
      removeEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
        windowListeners.delete(listener);
      },
      visualViewport,
    });

    const onStoreChange = () => undefined;
    const unsubscribe = subscribeOverlayViewport(onStoreChange);

    expect(windowListeners.has(onStoreChange)).toBeTrue();
    expect(visualViewportListeners.has(onStoreChange)).toBeTrue();

    unsubscribe();

    expect(windowListeners.has(onStoreChange)).toBeFalse();
    expect(visualViewportListeners.has(onStoreChange)).toBeFalse();
  });
});
