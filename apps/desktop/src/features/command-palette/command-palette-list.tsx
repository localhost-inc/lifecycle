import { ScrollArea } from "@lifecycle/ui";
import type { CommandPaletteCommand, CommandPaletteCategory } from "./types";
import { CommandPaletteItem } from "./command-palette-item";

const CATEGORY_LABELS: Record<CommandPaletteCategory, string> = {
  navigation: "Navigation",
  workspace: "Workspaces",
  action: "Actions",
};

const CATEGORY_ORDER: CommandPaletteCategory[] = ["navigation", "workspace", "action"];

interface CommandPaletteListProps {
  commands: CommandPaletteCommand[];
  activeIndex: number;
  hasQuery: boolean;
  onSelect: (index: number) => void;
  onPointerEnter: (index: number) => void;
}

export function CommandPaletteList({
  commands,
  activeIndex,
  hasQuery,
  onSelect,
  onPointerEnter,
}: CommandPaletteListProps) {
  if (commands.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
        No results found
      </div>
    );
  }

  if (hasQuery) {
    return (
      <ScrollArea className="max-h-[360px]">
        <div className="border-t border-[var(--border)] p-2" role="listbox">
          {commands.map((command, index) => (
            <CommandPaletteItem
              key={command.id}
              command={command}
              isActive={index === activeIndex}
              onSelect={() => onSelect(index)}
              onPointerEnter={() => onPointerEnter(index)}
            />
          ))}
        </div>
      </ScrollArea>
    );
  }

  const grouped = new Map<CommandPaletteCategory, CommandPaletteCommand[]>();
  for (const command of commands) {
    const list = grouped.get(command.category) ?? [];
    list.push(command);
    grouped.set(command.category, list);
  }

  let flatIndex = 0;

  return (
    <ScrollArea className="max-h-[360px]">
      <div className="border-t border-[var(--border)] p-2" role="listbox">
        {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((category, categoryIndex) => {
          const items = grouped.get(category)!;
          return (
            <div key={category} className={categoryIndex > 0 ? "mt-2" : undefined}>
              <div className="px-3 pb-1 pt-2 text-xs text-[var(--muted-foreground)]">
                {CATEGORY_LABELS[category]}
              </div>
              {items.map((command) => {
                const index = flatIndex++;
                return (
                  <CommandPaletteItem
                    key={command.id}
                    command={command}
                    isActive={index === activeIndex}
                    onSelect={() => onSelect(index)}
                    onPointerEnter={() => onPointerEnter(index)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
