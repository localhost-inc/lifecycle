import { describe, expect, test } from "vitest";
import { GitActionButton, GitActionPopover } from "@/features/git/components/git-action-button";

describe("GitActionButton", () => {
  test("exports GitActionButton and GitActionPopover", () => {
    expect(typeof GitActionButton).toBe("function");
    expect(typeof GitActionPopover).toBe("function");
  });
});
