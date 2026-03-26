import { describe, expect, test } from "bun:test";
import {
  buildCloseFileEditorSessionPrompt,
  pruneFileEditorSessions,
  updateFileEditorSession,
  type FileEditorSessionsState,
} from "@/features/editor/state/file-editor-sessions";

describe("file editor sessions", () => {
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
    const current: FileEditorSessionsState = {
      "file:a": fileASession,
      "file:b": fileBSession,
    };

    expect(pruneFileEditorSessions(current, ["file:b"])).toEqual({
      "file:b": fileBSession,
    });
    expect(pruneFileEditorSessions(current, ["file:a", "file:b"])).toBe(current);
  });

  test("updates and clears session entries without rewriting identical state", () => {
    const initialSession = {
      conflictDiskContent: null,
      draftContent: "draft",
      savedContent: "saved",
    };
    const current: FileEditorSessionsState = {
      "file:a": initialSession,
    };

    const identical = updateFileEditorSession(current, "file:a", initialSession);
    expect(identical).toBe(current);

    const updated = updateFileEditorSession(current, "file:a", {
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

    expect(updateFileEditorSession(updated, "file:a", null)).toEqual({});
    expect(updateFileEditorSession({}, "file:missing", null)).toEqual({});
  });

  test("builds close prompts only for dirty sessions", () => {
    expect(
      buildCloseFileEditorSessionPrompt(
        {
          conflictDiskContent: null,
          draftContent: "same",
          savedContent: "same",
        },
        "README.md",
      ),
    ).toBeNull();

    expect(
      buildCloseFileEditorSessionPrompt(
        {
          conflictDiskContent: null,
          draftContent: "draft",
          savedContent: "saved",
        },
        "README.md",
      ),
    ).toBe('"README.md" has unsaved edits. Close the tab and discard them?');

    expect(
      buildCloseFileEditorSessionPrompt(
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
