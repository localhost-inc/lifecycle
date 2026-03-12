import { describe, expect, test } from "bun:test";
import { readSettingsSectionHash, settingsSections } from "./settings-sections";

describe("settingsSections", () => {
  test("lists only live settings sections", () => {
    expect(settingsSections.map((section) => section.slug)).toEqual([
      "appearance",
      "notifications",
      "worktrees",
    ]);
  });
});

describe("readSettingsSectionHash", () => {
  test("parses valid section hashes", () => {
    expect(readSettingsSectionHash("#appearance")).toBe("appearance");
    expect(readSettingsSectionHash("#notifications")).toBe("notifications");
    expect(readSettingsSectionHash("worktrees")).toBe("worktrees");
  });

  test("rejects stale placeholder hashes", () => {
    expect(readSettingsSectionHash("#terminal")).toBeNull();
    expect(readSettingsSectionHash("#diagnostics")).toBeNull();
    expect(readSettingsSectionHash("#configuration")).toBeNull();
    expect(readSettingsSectionHash("#mcp-servers")).toBeNull();
    expect(readSettingsSectionHash("")).toBeNull();
  });
});
