import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lifecycle/ui";
import { useState } from "react";
import {
  DEFAULT_HARNESS_PROVIDER,
  type CreateTerminalRequest,
  type HarnessProvider,
  type TerminalRow,
} from "../api";
import { TerminalLaunchActions } from "./terminal-launch-actions";
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
      <div className="relative flex items-end border-b border-[var(--border)] bg-[var(--panel)]">
        <div className="flex min-w-0 flex-1 items-end">
          {terminals.map((terminal) => {
            const active = terminal.id === activeTerminalId;
            return (
              <button
                key={terminal.id}
                type="button"
                onClick={() => onSelectTerminal(terminal.id)}
                className={`group relative flex min-w-0 max-w-48 items-center gap-2 border-x border-t px-3 py-1.5 text-left text-[13px] transition-colors ${
                  active
                    ? "-mb-px z-10 border-[var(--border)] bg-[var(--background)] pb-2 font-medium text-[var(--foreground)]"
                    : "border-transparent text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
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
                  className="ml-auto shrink-0 rounded p-0.5 text-[var(--muted-foreground)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 px-1 py-1">
          <Button
            className="h-8 px-2 text-xs"
            disabled={creatingSelection !== null}
            onClick={() => setResumeOpen((current) => !current)}
            size="sm"
            variant="ghost"
          >
            {resumeOpen ? "Hide Resume" : "Resume"}
          </Button>
          <TerminalLaunchActions
            creatingSelection={creatingSelection}
            onCreateTerminal={onCreateTerminal}
          />
        </div>
      </div>
      {resumeOpen && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <Select
            onValueChange={(value) => {
              setResumeHarnessProvider(value as HarnessProvider);
            }}
            value={resumeHarnessProvider}
          >
            <SelectTrigger className="w-32" disabled={creatingSelection !== null}>
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude">Claude</SelectItem>
              <SelectItem value="codex">Codex</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="min-w-[14rem] flex-1"
            value={harnessSessionId}
            onChange={(event) => {
              setHarnessSessionId(event.target.value);
            }}
            placeholder="Session ID"
            spellCheck={false}
            disabled={creatingSelection !== null}
          />
          <Button
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
            size="sm"
            variant="outline"
          >
            {creatingSelection === resumeHarnessProvider ? "Starting..." : "Start"}
          </Button>
          <Button
            onClick={() => {
              setResumeOpen(false);
              setHarnessSessionId("");
            }}
            size="sm"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
