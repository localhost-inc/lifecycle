import { describe, expect, it } from "vitest";
import { filterAndSort, fuzzyMatch } from "@/features/command-palette/fuzzy-match";
import type { CommandPaletteCommand } from "@/features/command-palette/types";

describe("fuzzyMatch", () => {
  it("matches exact substring", () => {
    const result = fuzzyMatch("dash", "Dashboard");
    expect(result.match).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("matches case-insensitively", () => {
    const result = fuzzyMatch("DASH", "dashboard");
    expect(result.match).toBe(true);
  });

  it("matches character-by-character across text", () => {
    const result = fuzzyMatch("gdb", "Go to Dashboard");
    expect(result.match).toBe(true);
  });

  it("does not match when characters are missing", () => {
    const result = fuzzyMatch("xyz", "Dashboard");
    expect(result.match).toBe(false);
  });

  it("returns zero score for empty query", () => {
    const result = fuzzyMatch("", "anything");
    expect(result.match).toBe(true);
    expect(result.score).toBe(0);
  });

  it("scores word-start matches higher", () => {
    const wordStart = fuzzyMatch("os", "Open Settings");
    const middle = fuzzyMatch("ns", "Open Settings");
    expect(wordStart.score).toBeGreaterThan(middle.score);
  });

  it("scores exact substring higher than scattered match", () => {
    const exact = fuzzyMatch("set", "Settings");
    const scattered = fuzzyMatch("set", "Select Template");
    expect(exact.score).toBeGreaterThan(scattered.score);
  });
});

describe("filterAndSort", () => {
  const icon = () => null;
  const commands: CommandPaletteCommand[] = [
    {
      id: "go-dashboard",
      category: "navigation",
      label: "Go to Dashboard",
      keywords: ["home"],
      icon: icon as unknown as CommandPaletteCommand["icon"],
      onExecute: () => {},
    },
    {
      id: "open-settings",
      category: "navigation",
      label: "Open Settings",
      keywords: ["preferences", "config"],
      icon: icon as unknown as CommandPaletteCommand["icon"],
      shortcut: "Cmd+,",
      onExecute: () => {},
    },
    {
      id: "ws-1",
      category: "workspace",
      label: "my-project / main",
      keywords: ["workspace"],
      icon: icon as unknown as CommandPaletteCommand["icon"],
      onExecute: () => {},
    },
  ];

  it("returns all commands for empty query", () => {
    const result = filterAndSort("", commands);
    expect(result).toHaveLength(3);
  });

  it("uses priority to rank empty-query results", () => {
    const result = filterAndSort("", [
      {
        ...commands[0]!,
        priority: 10,
      },
      {
        ...commands[1]!,
        priority: 120,
      },
    ]);

    expect(result[0]?.id).toBe("open-settings");
  });

  it("filters to matching commands", () => {
    const result = filterAndSort("settings", commands);
    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe("open-settings");
  });

  it("searches keywords too", () => {
    const result = filterAndSort("home", commands);
    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe("go-dashboard");
  });

  it("ranks better matches first", () => {
    const result = filterAndSort("main", commands);
    expect(result[0]?.id).toBe("ws-1");
  });

  it("uses priority as a tie-breaker for similar matches", () => {
    const result = filterAndSort("read", [
      {
        id: "readme",
        category: "workspace",
        label: "README.md",
        keywords: ["README.md"],
        icon: icon as unknown as CommandPaletteCommand["icon"],
        onExecute: () => {},
        priority: 120,
      },
      {
        id: "readme-copy",
        category: "workspace",
        label: "README copy.md",
        keywords: ["README copy.md"],
        icon: icon as unknown as CommandPaletteCommand["icon"],
        onExecute: () => {},
      },
    ]);

    expect(result[0]?.id).toBe("readme");
  });
});
