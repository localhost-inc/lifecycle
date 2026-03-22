import { describe, expect, test } from "bun:test";
import {
  buildCloseWorkspaceFileSessionPrompt,
  pruneWorkspaceFileSessions,
  updateWorkspaceFileSession,
  type WorkspaceFileSessionsState,
} from "@/features/explorer/state/workspace-file-sessions";

describe("workspace file sessions", () => {
  test("prunes sessions for tabs that are no longer open", () => {
    const fileASession = {
      conflictDiskContent: null,
      draftContent: "draft a",
      savedContent: "saved a",
    };
    const fileBSession = {
      conflictDiskContent: null,
      draftContent: "draft b",
      savedContent: "saved b",
    };
    const current: WorkspaceFileSessionsState = {
      "file:a": fileASession,
      "file:b": fileBSession,
    };

    expect(pruneWorkspaceFileSessions(current, ["file:b"])).toEqual({
      "file:b": fileBSession,
    });
    expect(pruneWorkspaceFileSessions(current, ["file:a", "file:b"])).toBe(current);
  });

  test("updates and clears session entries without rewriting identical state", () => {
    const initialSession = {
      conflictDiskContent: null,
      draftContent: "draft",
      savedContent: "saved",
    };
    const current: WorkspaceFileSessionsState = {
      "file:a": initialSession,
    };

    const identical = updateWorkspaceFileSession(current, "file:a", initialSession);
    expect(identical).toBe(current);

    const updated = updateWorkspaceFileSession(current, "file:a", {
      conflictDiskContent: "disk",
      draftContent: "draft",
      savedContent: "saved",
    });
    expect(updated).toEqual({
      "file:a": {
        conflictDiskContent: "disk",
        draftContent: "draft",
        savedContent: "saved",
      },
    });

    expect(updateWorkspaceFileSession(updated, "file:a", null)).toEqual({});
    expect(updateWorkspaceFileSession({}, "file:missing", null)).toEqual({});
  });

  test("builds close prompts only for dirty sessions", () => {
    expect(
      buildCloseWorkspaceFileSessionPrompt(
        {
          conflictDiskContent: null,
          draftContent: "same",
          savedContent: "same",
        },
        "README.md",
      ),
    ).toBeNull();

    expect(
      buildCloseWorkspaceFileSessionPrompt(
        {
          conflictDiskContent: null,
          draftContent: "draft",
          savedContent: "saved",
        },
        "README.md",
      ),
    ).toBe('"README.md" has unsaved edits. Close the tab and discard them?');

    expect(
      buildCloseWorkspaceFileSessionPrompt(
        {
          conflictDiskContent: "disk",
          draftContent: "draft",
          savedContent: "saved",
        },
        "README.md",
      ),
    ).toBe(
      '"README.md" has unsaved edits and changed on disk. Close the tab and discard your local draft?',
    );
  });
});
