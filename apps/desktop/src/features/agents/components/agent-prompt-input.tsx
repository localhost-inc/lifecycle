import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { AgentImageMediaType } from "@lifecycle/agents";
import type { CommandPaletteCommand } from "@/features/command-palette/types";
import { InputTriggerMenu, type InputTriggerMenuHandle } from "./input-trigger-menu";
import { parseTrigger } from "./input-trigger-parse";

// ---------------------------------------------------------------------------
// Prompt highlight overlay — renders @file tokens in accent color
// ---------------------------------------------------------------------------

function PromptHighlight({ text }: { text: string }) {
  if (!text.includes("@")) {
    return <>{text}</>;
  }
  const parts = text.split(/(@\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") && part.length > 1 ? (
          <span key={i} className="text-[var(--accent)]">
            {part}
          </span>
        ) : (
          <span key={i} className="text-[var(--foreground)]">
            {part}
          </span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Agent prompt input
// ---------------------------------------------------------------------------

export interface AgentPromptInputHandle {
  focus: () => void;
}

interface AgentPromptInputProps {
  agentSessionId: string;
  draftPrompt: string;
  error: string | null;
  fileItems: CommandPaletteCommand[];
  commandItems: CommandPaletteCommand[];
  isRunning: boolean;
  pendingImages: Array<{ mediaType: AgentImageMediaType; base64Data: string }>;
  planMode: boolean;
  onAddImagesFromFiles: (files: FileList | File[]) => void;
  onRemovePendingImage: (index: number) => void;
  onDraftPromptChange: (value: string) => void;
  onSend: () => void;
}

export const AgentPromptInput = forwardRef<AgentPromptInputHandle, AgentPromptInputProps>(
  function AgentPromptInput(
    {
      draftPrompt,
      error,
      fileItems,
      commandItems,
      isRunning,
      pendingImages,
      planMode,
      onAddImagesFromFiles,
      onRemovePendingImage,
      onDraftPromptChange,
      onSend,
    },
    ref,
  ) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const triggerMenuRef = useRef<InputTriggerMenuHandle>(null);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const showCursorBlink = inputFocused && !isRunning && draftPrompt.length === 0;

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (triggerMenuRef.current?.handleKeyDown(event)) return;

    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      onSend();
    }
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    onDraftPromptChange(event.target.value);
    setCursorPosition(event.target.selectionStart ?? 0);
    const el = event.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  const handleSelectFile = useCallback(
    (filePath: string) => {
      const trigger = parseTrigger(draftPrompt, cursorPosition);
      if (trigger.trigger === "@") {
        const insertion = `@${filePath} `;
        const newValue =
          draftPrompt.slice(0, trigger.startIndex) + insertion + draftPrompt.slice(trigger.endIndex);
        onDraftPromptChange(newValue);
        const newCursor = trigger.startIndex + insertion.length;
        setCursorPosition(newCursor);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = newCursor;
            textareaRef.current.selectionEnd = newCursor;
          }
        });
      }
      textareaRef.current?.focus();
    },
    [draftPrompt, cursorPosition, onDraftPromptChange],
  );

  const handleExecuteCommand = useCallback(
    (command: CommandPaletteCommand) => {
      const trigger = parseTrigger(draftPrompt, cursorPosition);
      if (trigger.trigger === "/") {
        const newValue =
          draftPrompt.slice(0, trigger.startIndex) + draftPrompt.slice(trigger.endIndex);
        onDraftPromptChange(newValue);
        setCursorPosition(trigger.startIndex);
      }
      command.onExecute();
      textareaRef.current?.focus();
    },
    [draftPrompt, cursorPosition, onDraftPromptChange],
  );

  function handleTriggerDismiss(): void {
    textareaRef.current?.focus();
  }

  return (
    <div
      className="shrink-0 cursor-text bg-[var(--surface-hover)]/50"
      onClick={() => textareaRef.current?.focus()}
    >
      {pendingImages.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-4 pt-2">
          {pendingImages.map((img, i) => (
            <div key={i} className="group relative">
              <img
                src={`data:${img.mediaType};base64,${img.base64Data}`}
                alt={`Attached image ${i + 1}`}
                className="h-16 w-16 rounded border border-[var(--border)] object-cover"
              />
              <button
                className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-[var(--destructive)] text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onRemovePendingImage(i)}
                type="button"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div
        className="flex cursor-text items-start px-4 pt-3 pb-2"
        onClick={() => textareaRef.current?.focus()}
      >
        <span className="shrink-0 pt-[3px] text-[13px] text-[var(--accent)]">
          &#9654;&nbsp;
        </span>
        <div className="relative min-w-0 flex-1">
          <InputTriggerMenu
            ref={triggerMenuRef}
            textareaRef={textareaRef}
            draftPrompt={draftPrompt}
            cursorPosition={cursorPosition}
            fileItems={fileItems}
            commandItems={commandItems}
            onSelectFile={handleSelectFile}
            onExecuteCommand={handleExecuteCommand}
            onDismiss={handleTriggerDismiss}
          />
          {/* Highlight overlay — renders accent-colored @file tokens over the transparent textarea */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words font-[var(--font-mono)] text-[13px] leading-6 text-[var(--foreground)] p-0 m-0"
          >
            <PromptHighlight text={draftPrompt} />
          </div>
          <textarea
            ref={textareaRef}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className={`relative w-full resize-none overflow-hidden bg-transparent font-[var(--font-mono)] text-[13px] leading-6 text-transparent outline-none p-0 m-0 ${showCursorBlink ? "caret-transparent" : "caret-[var(--foreground)]"}`}
            onBlur={() => setInputFocused(false)}
            onChange={handleTextareaChange}
            onFocus={() => setInputFocused(true)}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => setCursorPosition(e.currentTarget.selectionStart ?? 0)}
            onSelect={(e) => setCursorPosition(e.currentTarget.selectionStart ?? 0)}
            onPaste={(e) => {
              const files = e.clipboardData?.files;
              if (files && files.length > 0) {
                const hasImages = Array.from(files).some((f) => f.type.startsWith("image/"));
                if (hasImages) {
                  e.preventDefault();
                  onAddImagesFromFiles(files);
                }
              }
            }}
            placeholder={planMode ? "plan mode — shift+tab to exit" : ""}
            rows={1}
            style={{ height: "auto" }}
            value={draftPrompt}
          />
          {showCursorBlink ? (
            <span className="agent-cursor-blink pointer-events-none absolute left-0 top-[5px] h-[14px] w-[7px] bg-[var(--foreground)]" />
          ) : null}
        </div>
      </div>
      {error ? (
        <div className="px-4 pb-1 text-[12px] text-[var(--destructive)]">
          <span>[!]</span> {error}
        </div>
      ) : null}
    </div>
  );
  },
);
