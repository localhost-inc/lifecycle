import { useCallback, useState, type KeyboardEvent } from "react";
import { Dialog, DialogPopup } from "@lifecycle/ui";
import { filterAndSort } from "./fuzzy-match";
import { CommandPaletteInput } from "./command-palette-input";
import { CommandPaletteList } from "./command-palette-list";
import type { CommandPaletteCommand } from "./types";

interface CommandPaletteProps {
  commands: CommandPaletteCommand[];
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ commands, isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = filterAndSort(query, commands);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(0);
  }, []);

  const handleSelect = useCallback(
    (index: number) => {
      const command = filtered[index];
      if (command) {
        onClose();
        setQuery("");
        setActiveIndex(0);
        command.onExecute();
      }
    },
    [filtered, onClose],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % Math.max(filtered.length, 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          current <= 0 ? Math.max(filtered.length - 1, 0) : current - 1,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleSelect(activeIndex);
        return;
      }
    },
    [activeIndex, filtered.length, handleSelect],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
        setQuery("");
        setActiveIndex(0);
      }
    },
    [onClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPopup>
        <div
          className="w-full max-w-[560px] origin-top overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_16px_70px_-12px_rgba(0,0,0,0.3)] transition-[transform,opacity] data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0"
          onClick={(event) => event.stopPropagation()}
        >
          <CommandPaletteInput
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
          />
          <CommandPaletteList
            commands={filtered}
            activeIndex={activeIndex}
            hasQuery={query.trim().length > 0}
            onSelect={handleSelect}
            onPointerEnter={setActiveIndex}
          />
        </div>
      </DialogPopup>
    </Dialog>
  );
}
