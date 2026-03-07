import { useState } from "react";
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

export function TerminalTabs({
  activeTerminalId,
  creatingSelection,
  onCloseTerminal,
  onCreateTerminal,
  onSelectTerminal,
  terminals,
}: TerminalTabsProps) {
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeHarnessProvider, setResumeHarnessProvider] =
    useState<HarnessProvider>(DEFAULT_HARNESS_PROVIDER);
  const [harnessSessionId, setHarnessSessionId] = useState("");
  const canSubmitResume = harnessSessionId.trim().length > 0 && creatingSelection === null;

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
        <div className="flex shrink-0 items-center gap-0.5 px-1 py-1">
          <button
            type="button"
            title="New shell"
            onClick={() => onCreateTerminal({ launchType: "shell" })}
            disabled={creatingSelection !== null}
            className="flex items-center justify-center p-1.5 text-[var(--muted-foreground)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-60"
          >
            {creatingSelection === "shell" ? (
              <span className="block h-[14px] w-[14px] animate-pulse rounded-full bg-current opacity-50" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4l5 4-5 4" />
                <path d="M9 12h5" />
              </svg>
            )}
          </button>
          <button
            type="button"
            title="New Claude session"
            onClick={() => onCreateTerminal({ launchType: "harness", harnessProvider: "claude" })}
            disabled={creatingSelection !== null}
            className="flex items-center justify-center p-1.5 text-[var(--muted-foreground)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-60"
          >
            {creatingSelection === "claude" ? (
              <span className="block h-[14px] w-[14px] animate-pulse rounded-full bg-current opacity-50" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            title="New Codex session"
            onClick={() => onCreateTerminal({ launchType: "harness", harnessProvider: "codex" })}
            disabled={creatingSelection !== null}
            className="flex items-center justify-center p-1.5 text-[var(--muted-foreground)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-60"
          >
            {creatingSelection === "codex" ? (
              <span className="block h-[14px] w-[14px] animate-pulse rounded-full bg-current opacity-50" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
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
