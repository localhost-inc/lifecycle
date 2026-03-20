import { ScrollArea } from "@lifecycle/ui";
import type { CommandPaletteCommand } from "@/features/command-palette/types";
import { CommandPaletteItem } from "@/features/command-palette/command-palette-item";
import { buildCommandPaletteSections } from "@/features/command-palette/command-palette-sections";

interface CommandPaletteListProps {
  commands: CommandPaletteCommand[];
  activeIndex: number;
  emptyMessage: string;
  grouped: boolean;
  onSelect: (index: number) => void;
  onPointerEnter: (index: number) => void;
}

export function CommandPaletteList({
  commands,
  activeIndex,
  emptyMessage,
  grouped,
  onSelect,
  onPointerEnter,
}: CommandPaletteListProps) {
  if (commands.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
        {emptyMessage}
      </div>
    );
  }
  const sections = buildCommandPaletteSections(commands, grouped);

  return (
    <ScrollArea className="max-h-[360px]">
      <div className="border-t border-[var(--border)] p-2" role="listbox">
        {sections.map((section, sectionIndex) => {
          return (
            <div key={section.id} className={sectionIndex > 0 ? "mt-2" : undefined}>
              {section.label ? (
                <div className="px-3 pb-1 pt-2 text-xs text-[var(--muted-foreground)]">
                  {section.label}
                </div>
              ) : null}
              {section.items.map(({ command, index }) => {
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
