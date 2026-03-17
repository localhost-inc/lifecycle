import { describe, expect, test } from "bun:test";
import { readSettingsSectionHash, settingsSections } from "./settings-sections";

describe("settingsSections", () => {
  test("lists only live settings sections", () => {
    expect(settingsSections.map((section) => section.slug)).toEqual([
      "appearance",
      "agents",
      "workspace",
      "notifications",
      "account",
    ]);
  });
});

describe("readSettingsSectionHash", () => {
  test("parses valid section hashes", () => {
    expect(readSettingsSectionHash("#agents")).toBe("agents");
    expect(readSettingsSectionHash("#workspace")).toBe("workspace");
    expect(readSettingsSectionHash("#notifications")).toBe("notifications");
    expect(readSettingsSectionHash("#appearance")).toBe("appearance");
    expect(readSettingsSectionHash("#account")).toBe("account");
  });

  test("rejects stale placeholder hashes", () => {
    expect(readSettingsSectionHash("#harnesses")).toBeNull();
    expect(readSettingsSectionHash("#worktrees")).toBeNull();
    expect(readSettingsSectionHash("#terminal")).toBeNull();
    expect(readSettingsSectionHash("#diagnostics")).toBeNull();
    expect(readSettingsSectionHash("#configuration")).toBeNull();
    expect(readSettingsSectionHash("#mcp-servers")).toBeNull();
    expect(readSettingsSectionHash("")).toBeNull();
  });
});
