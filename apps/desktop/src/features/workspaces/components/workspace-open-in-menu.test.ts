import { describe, expect, test } from "bun:test";
import { getWorkspaceOpenInItemClassName } from "./workspace-open-in-menu";

describe("WorkspaceOpenInMenu", () => {
  test("does not keep any row selected when it is not highlighted", () => {
    const className = getWorkspaceOpenInItemClassName({
      highlighted: false,
    });

    expect(className).not.toContain("bg-[var(--surface-selected)]");
  });

  test("applies the hover highlight when the row is explicitly highlighted", () => {
    const className = getWorkspaceOpenInItemClassName({
      highlighted: true,
    });

    expect(className).toContain("bg-[var(--surface-hover)]");
    expect(className).not.toContain("bg-[var(--surface-selected)]");
  });
});
