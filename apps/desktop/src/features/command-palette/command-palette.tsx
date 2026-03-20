import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Dialog, DialogPopup } from "@lifecycle/ui";
import { filterAndSort } from "@/features/command-palette/fuzzy-match";
import { CommandPaletteInput } from "@/features/command-palette/command-palette-input";
import { CommandPaletteList } from "@/features/command-palette/command-palette-list";
import type { CommandPaletteCommand, CommandPaletteMode } from "@/features/command-palette/types";

const MAX_VISIBLE_RESULTS = 200;

interface CommandPaletteProps {
  commands: CommandPaletteCommand[];
  fileError: unknown;
  fileItems: CommandPaletteCommand[];
  fileLoading: boolean;
  isOpen: boolean;
  mode: CommandPaletteMode;
  onClose: () => void;
}

export function CommandPalette({
  commands,
  fileError,
  fileItems,
  fileLoading,
  isOpen,
  mode,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const items = mode === "files" ? fileItems : commands;
  const filtered = filterAndSort(query, items).slice(0, MAX_VISIBLE_RESULTS);
  const grouped = mode === "commands" && query.trim().length === 0;
  const placeholder =
    mode === "files" ? "Type a file name or path..." : "Type a command or search...";
  const emptyMessage =
    mode === "files"
      ? fileLoading
        ? "Loading workspace files..."
        : fileError
          ? `Failed to load workspace files: ${String(fileError)}`
          : "No matching files found"
      : "No results found";

  const reset = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    reset();
  }, [mode, reset]);

  useEffect(() => {
    if (activeIndex < filtered.length) {
      return;
    }

    setActiveIndex(Math.max(filtered.length - 1, 0));
  }, [activeIndex, filtered.length]);

  const executeAndClose = useCallback(
    (command: CommandPaletteCommand | undefined) => {
      if (!command) return;

      onClose();
      reset();
      command.onExecute();
    },
    [onClose, reset],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const count = filtered.length;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % Math.max(count, 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (current <= 0 ? Math.max(count - 1, 0) : current - 1));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        executeAndClose(filtered[activeIndex]);
        return;
      }
    },
    [activeIndex, executeAndClose, filtered],
  );

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(0);
  }, []);

  const handleSelect = useCallback(
    (index: number) => {
      executeAndClose(filtered[index]);
    },
    [executeAndClose, filtered],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
        reset();
      }
    },
    [onClose, reset],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPopup>
        <div
          className="w-full max-w-[560px] origin-top overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_16px_70px_-12px_rgba(0,0,0,0.3)] transition-[transform,opacity] data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0"
          onClick={(event) => event.stopPropagation()}
        >
          <CommandPaletteInput
            placeholder={placeholder}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
          />
          <CommandPaletteList
            commands={filtered}
            activeIndex={activeIndex}
            emptyMessage={emptyMessage}
            grouped={grouped}
            onSelect={handleSelect}
            onPointerEnter={setActiveIndex}
          />
        </div>
      </DialogPopup>
    </Dialog>
  );
}
