import { useState, useCallback } from "react";
import type { ServiceRow, WorkspaceRow } from "../api";
import { formatRelativeTime } from "../../../lib/format";

// --- Inline status maps (mirrors service-indicator.tsx) ---

const statusIcon: Record<string, string> = {
  stopped: "○",
  starting: "◌",
  ready: "●",
  failed: "✕",
};

const statusColor: Record<string, string> = {
  stopped: "text-[var(--muted-foreground)]",
  starting: "text-blue-500 animate-pulse",
  ready: "text-emerald-500",
  failed: "text-red-500",
};

// --- CopyableValue ---

function CopyableValue({ value, display }: { value: string; display?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      className="cursor-pointer font-mono text-xs text-[var(--foreground)] hover:text-[var(--accent)] transition-colors"
      title={value}
    >
      {copied ? "Copied" : (display ?? value)}
    </button>
  );
}

// --- Row helpers ---

const labelClass = "text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]";
const valueClass = "font-mono text-xs text-[var(--foreground)] truncate";
const sectionHeader = "text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)] font-medium";

function KVRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={labelClass}>{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

// --- Main component ---

interface WorkspaceSidePanelProps {
  hasManifest: boolean;
  services: ServiceRow[];
  workspace: WorkspaceRow;
}

export function WorkspaceSidePanel({
  hasManifest,
  services,
  workspace,
}: WorkspaceSidePanelProps) {
  const readyCount = services.filter((s) => s.status === "ready").length;
  const worktreeBasename = workspace.worktree_path
    ? workspace.worktree_path.split("/").pop()
    : null;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)]">
      {/* SOURCE */}
      <section className="flex flex-col gap-2.5 px-5 py-5">
        <span className={sectionHeader}>Source</span>
        <div className="flex flex-col gap-2">
          <KVRow label="Ref">
            <span className={`${valueClass}`}>{workspace.source_ref}</span>
          </KVRow>
          <KVRow label="SHA">
            {workspace.git_sha ? (
              <CopyableValue value={workspace.git_sha} display={workspace.git_sha.slice(0, 8)} />
            ) : (
              <span className="text-xs text-[var(--muted-foreground)]">&mdash;</span>
            )}
          </KVRow>
          <KVRow label="Mode">
            <span className={valueClass}>{workspace.mode}</span>
          </KVRow>
          {worktreeBasename && workspace.worktree_path && (
            <KVRow label="Worktree">
              <CopyableValue value={workspace.worktree_path} display={worktreeBasename} />
            </KVRow>
          )}
          {workspace.source_workspace_id && (
            <KVRow label="Origin">
              <span className={valueClass}>{workspace.source_workspace_id.slice(0, 8)}</span>
            </KVRow>
          )}
        </div>
      </section>

      <div className="border-t border-[var(--border)]" />

      {/* SERVICES */}
      <section className="flex flex-col gap-2.5 px-5 py-5">
        <div className="flex items-center justify-between">
          <span className={sectionHeader}>Services</span>
          {services.length > 0 && (
            <span className="text-[10px] tracking-[0.18em] text-[var(--muted-foreground)]">
              {readyCount}/{services.length}
            </span>
          )}
        </div>
        {!hasManifest ? (
          <p className="text-xs text-[var(--muted-foreground)]">No lifecycle.json</p>
        ) : services.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">No services defined</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {services.map((svc) => {
              const icon = statusIcon[svc.status] ?? "?";
              const color = statusColor[svc.status] ?? "text-stone-400";
              return (
                <div
                  key={svc.id}
                  className="rounded px-2 py-1.5 hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                      <span className={`text-[11px] ${color}`}>{icon}</span>
                      {svc.service_name}
                    </span>
                    {svc.effective_port && (
                      <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                        :{svc.effective_port}
                      </span>
                    )}
                  </div>
                  {svc.status_reason && (
                    <p className="mt-0.5 pl-5 text-[11px] text-red-400">{svc.status_reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="border-t border-[var(--border)]" />

      {/* ACTIVITY */}
      <section className="flex flex-col gap-2.5 px-5 py-5">
        <span className={sectionHeader}>Activity</span>
        <div className="flex flex-col gap-2">
          <KVRow label="Created">
            <span className="text-xs text-[var(--foreground)]">
              {formatRelativeTime(workspace.created_at)}
            </span>
          </KVRow>
          <KVRow label="Active">
            <span className="text-xs text-[var(--foreground)]">
              {formatRelativeTime(workspace.last_active_at)}
            </span>
          </KVRow>
          {workspace.expires_at && (
            <KVRow label="Expires">
              <span className="text-xs text-[var(--foreground)]">
                {formatRelativeTime(workspace.expires_at)}
              </span>
            </KVRow>
          )}
        </div>
      </section>
    </aside>
  );
}
