import { describe, expect, test } from "bun:test";
import { Circle } from "lucide-react";
import type { CommandPaletteCommand } from "./types";
import { buildCommandPaletteSections } from "./command-palette-sections";

function createCommand(
  id: string,
  category: CommandPaletteCommand["category"],
): CommandPaletteCommand {
  return {
    id,
    category,
    label: id,
    keywords: [],
    icon: Circle,
    onExecute: () => {},
  };
}

describe("buildCommandPaletteSections", () => {
  test("groups empty-query commands by category and keeps a flat index", () => {
    const sections = buildCommandPaletteSections(
      [
        createCommand("ws:a", "workspace"),
        createCommand("nav:a", "navigation"),
        createCommand("action:a", "action"),
        createCommand("ws:b", "workspace"),
      ],
      true,
    );

    expect(
      sections.map((section) => ({
        id: section.id,
        items: section.items.map(({ command, index }) => `${index}:${command.id}`),
        label: section.label,
      })),
    ).toEqual([
      {
        id: "navigation",
        items: ["0:nav:a"],
        label: "Navigation",
      },
      {
        id: "workspace",
        items: ["1:ws:a", "2:ws:b"],
        label: "Workspaces",
      },
      {
        id: "action",
        items: ["3:action:a"],
        label: "Actions",
      },
    ]);
  });

  test("returns a single flat results section while searching", () => {
    const sections = buildCommandPaletteSections(
      [createCommand("nav:a", "navigation"), createCommand("action:a", "action")],
      false,
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.label).toBeNull();
    expect(sections[0]?.items.map(({ command, index }) => `${index}:${command.id}`)).toEqual([
      "0:nav:a",
      "1:action:a",
    ]);
  });
});
