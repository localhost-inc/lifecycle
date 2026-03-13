import { cn } from "@lifecycle/ui";
import type { CommandPaletteCommand } from "./types";

function ShortcutKeys({ shortcut }: { shortcut: string }) {
  const parts = shortcut.split("+");
  return (
    <div className="flex shrink-0 items-center gap-1">
      {parts.map((key, i) => (
        <kbd
          key={i}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-[var(--border)] px-1 text-[11px] text-[var(--muted-foreground)]"
        >
          {key.trim()}
        </kbd>
      ))}
    </div>
  );
}

interface CommandPaletteItemProps {
  command: CommandPaletteCommand;
  isActive: boolean;
  onSelect: () => void;
  onPointerEnter: () => void;
}

export function CommandPaletteItem({
  command,
  isActive,
  onSelect,
  onPointerEnter,
}: CommandPaletteItemProps) {
  const Icon = command.icon;

  return (
    <div
      role="option"
      aria-selected={isActive}
      className={cn(
        "flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
        isActive ? "bg-[var(--muted)]" : "transparent",
      )}
      onClick={onSelect}
      onPointerEnter={onPointerEnter}
    >
      <Icon className="size-[18px] shrink-0 text-[var(--muted-foreground)]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[var(--foreground)]">{command.label}</div>
        {command.description ? (
          <div className="truncate text-xs text-[var(--muted-foreground)]">
            {command.description}
          </div>
        ) : null}
      </div>
      {command.shortcut && <ShortcutKeys shortcut={command.shortcut} />}
    </div>
  );
}
