import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ScrollArea } from "@lifecycle/ui";
import { filterAndSort } from "@/features/command-palette/fuzzy-match";
import type { CommandPaletteCommand } from "@/features/command-palette/types";
import { parseTrigger, type TriggerState } from "./input-trigger-parse";
import { getCaretCoordinates } from "./input-trigger-caret";

const MAX_VISIBLE = 12;

export interface InputTriggerMenuHandle {
  /** Returns true if the key event was consumed by the menu. */
  handleKeyDown(e: React.KeyboardEvent): boolean;
}

interface InputTriggerMenuProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  draftPrompt: string;
  cursorPosition: number;
  fileItems: CommandPaletteCommand[];
  commandItems: CommandPaletteCommand[];
  onSelectFile: (filePath: string) => void;
  onExecuteCommand: (command: CommandPaletteCommand) => void;
  onDismiss: () => void;
}

export const InputTriggerMenu = forwardRef<InputTriggerMenuHandle, InputTriggerMenuProps>(
  function InputTriggerMenu(
    {
      textareaRef,
      draftPrompt,
      cursorPosition,
      fileItems,
      commandItems,
      onSelectFile,
      onExecuteCommand,
      onDismiss,
    },
    ref,
  ) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [dismissed, setDismissed] = useState<number | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const trigger: TriggerState = useMemo(
      () => parseTrigger(draftPrompt, cursorPosition),
      [draftPrompt, cursorPosition],
    );

    // Reset dismissed state when trigger position changes (user typed something new).
    useEffect(() => {
      if (trigger.trigger !== null && trigger.startIndex !== dismissed) {
        setDismissed(null);
      }
    }, [trigger.trigger, trigger.startIndex, dismissed]);

    const isOpen = trigger.trigger !== null && dismissed !== trigger.startIndex;

    const items = useMemo(() => {
      if (!isOpen) return [];
      const source = trigger.trigger === "@" ? fileItems : commandItems;
      return filterAndSort(trigger.query, source).slice(0, MAX_VISIBLE);
    }, [isOpen, trigger.trigger, trigger.query, fileItems, commandItems]);

    // Clamp active index when items change.
    useEffect(() => {
      if (activeIndex >= items.length) {
        setActiveIndex(Math.max(items.length - 1, 0));
      }
    }, [activeIndex, items.length]);

    // Reset active index when trigger changes.
    useEffect(() => {
      setActiveIndex(0);
    }, [trigger.trigger, trigger.startIndex]);

    const selectItem = useCallback(
      (item: CommandPaletteCommand | undefined) => {
        if (!item) return;
        if (trigger.trigger === "@") {
          // The item's description is the directory path; id is `file:path`.
          const filePath = item.id.replace(/^file:/, "");
          onSelectFile(filePath);
        } else {
          onExecuteCommand(item);
        }
      },
      [trigger.trigger, onSelectFile, onExecuteCommand],
    );

    // Imperative keyboard handler.
    useImperativeHandle(
      ref,
      () => ({
        handleKeyDown(e: React.KeyboardEvent): boolean {
          if (!isOpen || items.length === 0) return false;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % items.length);
            return true;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
            return true;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            selectItem(items[activeIndex]);
            return true;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDismissed(trigger.startIndex);
            onDismiss();
            return true;
          }
          return false;
        },
      }),
      [isOpen, items, activeIndex, selectItem, trigger.startIndex, onDismiss],
    );

    // Scroll active item into view.
    useEffect(() => {
      if (!listRef.current) return;
      const active = listRef.current.querySelector("[aria-selected='true']");
      active?.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

    if (!isOpen || items.length === 0) return null;

    // Compute position relative to the textarea's wrapper (the parent with position: relative).
    const textarea = textareaRef.current;
    let menuLeft = 0;
    if (textarea) {
      const coords = getCaretCoordinates(textarea, trigger.startIndex);
      menuLeft = coords.left;
    }

    return (
      <div
        className="absolute bottom-full left-0 z-50 mb-1 overflow-hidden border border-[var(--border)] bg-[var(--surface)]"
        style={{ left: menuLeft, minWidth: 200, maxWidth: 400 }}
      >
        <ScrollArea className="max-h-[240px]">
          <div ref={listRef} className="py-0.5" role="listbox">
            {items.map((item, index) => (
              <div
                key={item.id}
                role="option"
                aria-selected={index === activeIndex}
                className={`flex cursor-default items-baseline gap-2 px-2 py-px font-[var(--font-mono)] text-[12px] leading-5 ${index === activeIndex ? "bg-[var(--muted)] text-[var(--foreground)]" : ""}`}
                onClick={() => selectItem(item)}
                onPointerEnter={() => setActiveIndex(index)}
              >
                <span className="truncate">{item.label}</span>
                {item.description ? (
                  <span className="truncate text-[11px] text-[var(--muted-foreground)]">
                    {item.description}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  },
);
