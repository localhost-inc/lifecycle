import { describe, expect, test } from "bun:test";
import { syncOverlayHostWebviewVisibility } from "./overlay-host-route";

describe("syncOverlayHostWebviewVisibility", () => {
  test("hides the host webview when no overlay is active", async () => {
    const calls: string[] = [];

    await syncOverlayHostWebviewVisibility(
      {
        hide: async () => {
          calls.push("hide");
        },
        setFocus: async () => {
          calls.push("focus");
        },
        show: async () => {
          calls.push("show");
        },
      },
      null,
    );

    expect(calls).toEqual(["hide"]);
  });

  test("shows the host webview without focusing for pointer-only overlays", async () => {
    const calls: string[] = [];

    await syncOverlayHostWebviewVisibility(
      {
        hide: async () => {
          calls.push("hide");
        },
        setFocus: async () => {
          calls.push("focus");
        },
        show: async () => {
          calls.push("show");
        },
      },
      {
        requiresWindowFocus: false,
      },
    );

    expect(calls).toEqual(["show"]);
  });

  test("shows and focuses the host webview for interactive overlays", async () => {
    const calls: string[] = [];

    await syncOverlayHostWebviewVisibility(
      {
        hide: async () => {
          calls.push("hide");
        },
        setFocus: async () => {
          calls.push("focus");
        },
        show: async () => {
          calls.push("show");
        },
      },
      {
        requiresWindowFocus: true,
      },
    );

    expect(calls).toEqual(["show", "focus"]);
  });
});
