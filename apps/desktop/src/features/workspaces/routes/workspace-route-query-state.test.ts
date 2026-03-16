import { describe, expect, test } from "bun:test";
import {
  readWorkspaceRoutePresentationState,
  writeWorkspaceRouteDialogState,
} from "./workspace-route-query-state";

describe("workspace route dialog query state", () => {
  test("reads the changes dialog from generic route params", () => {
    expect(
      readWorkspaceRoutePresentationState("dialog=changes&dialog-focus=src%2Fapp.tsx"),
    ).toEqual({
      dialog: {
        focusPath: "src/app.tsx",
        kind: "changes",
      },
    });
  });

  test("ignores unsupported dialog kinds", () => {
    expect(readWorkspaceRoutePresentationState("dialog=history")).toEqual({
      dialog: null,
    });
  });

  test("writes and clears generic workspace dialog params", () => {
    expect(
      writeWorkspaceRouteDialogState("tab=logs", {
        focusPath: "README.md",
        kind: "changes",
      }).toString(),
    ).toBe("tab=logs&dialog=changes&dialog-focus=README.md");

    expect(writeWorkspaceRouteDialogState("tab=logs&dialog=changes", null).toString()).toBe(
      "tab=logs",
    );
  });
});
