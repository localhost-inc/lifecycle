import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_HARNESS_PROVIDER,
  type CreateTerminalRequest,
  type HarnessProvider,
  type TerminalRow,
} from "../api";
import { TerminalStatusDot } from "./terminal-status-dot";

interface TerminalTabsProps {
  activeTerminalId: string | null;
  creatingSelection: "shell" | HarnessProvider | null;
  onCloseTerminal: (terminalId: string) => void;
  onCreateTerminal: (input: CreateTerminalRequest) => void;
  onSelectTerminal: (terminalId: string) => void;
  terminals: TerminalRow[];
}

const TERMINAL_MENU_WIDTH = 192;

export function TerminalTabs({
  activeTerminalId,
  creatingSelection,
  onCloseTerminal,
  onCreateTerminal,
  onSelectTerminal,
  terminals,
}: TerminalTabsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeHarnessProvider, setResumeHarnessProvider] =
    useState<HarnessProvider>(DEFAULT_HARNESS_PROVIDER);
  const [harnessSessionId, setHarnessSessionId] = useState("");
  const createButtonRef = useRef<HTMLButtonElement | null>(null);

  const canSubmitResume = harnessSessionId.trim().length > 0 && creatingSelection === null;

  useEffect(() => {
    if (!dropdownOpen) {
      setDropdownPosition(null);
      return;
    }

    const updateDropdownPosition = () => {
      const anchor = createButtonRef.current;
      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      setDropdownPosition({
        left: Math.max(8, Math.min(rect.right - TERMINAL_MENU_WIDTH, window.innerWidth - 8 - TERMINAL_MENU_WIDTH)),
        top: rect.bottom + 4,
      });
    };

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [dropdownOpen]);

  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex items-end border-b border-[var(--border)]">
        <div className="flex min-w-0 flex-1 items-end">
          {terminals.map((terminal) => {
            const active = terminal.id === activeTerminalId;
            return (
              <button
                key={terminal.id}
                type="button"
                onClick={() => onSelectTerminal(terminal.id)}
                className={`group flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm transition ${
                  active
                    ? "font-medium text-[var(--foreground)]"
                    : "bg-[var(--panel)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                <TerminalStatusDot status={terminal.status} />
                <span className="truncate">{terminal.label}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTerminal(terminal.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.stopPropagation();
                      onCloseTerminal(terminal.id);
                    }
                  }}
                  className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition hover:bg-[var(--surface-hover)] group-hover:opacity-100"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative shrink-0 px-1 py-1">
          <button
            ref={createButtonRef}
            type="button"
            onClick={() => setDropdownOpen((current) => !current)}
            disabled={creatingSelection !== null}
            className="flex items-center justify-center rounded p-1.5 text-[var(--muted-foreground)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-60"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M7 2v10M2 7h10" />
            </svg>
          </button>
        </div>
      </div>
      {dropdownOpen &&
        dropdownPosition &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setDropdownOpen(false)}
              onKeyDown={() => {}}
              role="presentation"
            />
            <div
              className="fixed z-50 w-48 rounded-md border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
              style={{ left: dropdownPosition.left, top: dropdownPosition.top }}
            >
              {(["shell", "claude", "codex"] as const).map((selection) => (
                <button
                  key={selection}
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onCreateTerminal(
                      selection === "shell"
                        ? { launchType: "shell" }
                        : { launchType: "harness", harnessProvider: selection },
                    );
                  }}
                  disabled={creatingSelection !== null}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-hover)] disabled:cursor-wait disabled:opacity-60"
                >
                  {creatingSelection === selection
                    ? "Starting..."
                    : selection.charAt(0).toUpperCase() + selection.slice(1)}
                </button>
              ))}
              <div className="my-1 border-t border-[var(--border)]" />
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  setResumeOpen(true);
                }}
                disabled={creatingSelection !== null}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-[var(--muted-foreground)] transition hover:bg-[var(--surface-hover)] disabled:cursor-wait disabled:opacity-60"
              >
                Resume session...
              </button>
            </div>
          </>,
          document.body,
        )}
      {resumeOpen && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <select
            value={resumeHarnessProvider}
            onChange={(event) => {
              setResumeHarnessProvider(event.target.value as HarnessProvider);
            }}
            disabled={creatingSelection !== null}
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)] disabled:cursor-wait disabled:opacity-60"
          >
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
          <input
            value={harnessSessionId}
            onChange={(event) => {
              setHarnessSessionId(event.target.value);
            }}
            placeholder="Session ID"
            spellCheck={false}
            disabled={creatingSelection !== null}
            className="min-w-[14rem] flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] disabled:cursor-wait disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => {
              const nextHarnessSessionId = harnessSessionId.trim();
              if (!nextHarnessSessionId) return;
              onCreateTerminal({
                launchType: "harness",
                harnessProvider: resumeHarnessProvider,
                harnessSessionId: nextHarnessSessionId,
              });
              setResumeOpen(false);
              setHarnessSessionId("");
            }}
            disabled={!canSubmitResume}
            className="rounded border border-[var(--primary)]/40 bg-[var(--primary)]/12 px-2.5 py-1 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--primary)]/18 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingSelection === resumeHarnessProvider ? "Starting..." : "Start"}
          </button>
          <button
            type="button"
            onClick={() => {
              setResumeOpen(false);
              setHarnessSessionId("");
            }}
            className="rounded px-2 py-1 text-xs text-[var(--muted-foreground)] transition hover:bg-[var(--surface-hover)]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
