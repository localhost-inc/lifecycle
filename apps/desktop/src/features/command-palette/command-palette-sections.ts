import type { CommandPaletteCommand, CommandPaletteCategory } from "@/features/command-palette/types";

const CATEGORY_LABELS: Record<CommandPaletteCategory, string> = {
  navigation: "Navigation",
  workspace: "Workspaces",
  action: "Actions",
};

const CATEGORY_ORDER: CommandPaletteCategory[] = ["navigation", "workspace", "action"];

export interface CommandPaletteSectionItem {
  command: CommandPaletteCommand;
  index: number;
}

export interface CommandPaletteSection {
  id: string;
  label: string | null;
  items: CommandPaletteSectionItem[];
}

export function buildCommandPaletteSections(
  commands: CommandPaletteCommand[],
  grouped: boolean,
): CommandPaletteSection[] {
  if (!grouped) {
    return [
      {
        id: "results",
        label: null,
        items: commands.map((command, index) => ({ command, index })),
      },
    ];
  }

  const groupedCommands = new Map<CommandPaletteCategory, CommandPaletteCommand[]>();
  for (const command of commands) {
    const items = groupedCommands.get(command.category) ?? [];
    items.push(command);
    groupedCommands.set(command.category, items);
  }

  let index = 0;

  return CATEGORY_ORDER.flatMap((category) => {
    const items = groupedCommands.get(category);
    if (!items?.length) {
      return [];
    }

    return [
      {
        id: category,
        label: CATEGORY_LABELS[category],
        items: items.map((command) => ({
          command,
          index: index++,
        })),
      },
    ];
  });
}
