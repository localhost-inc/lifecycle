import { useMemo, useState } from "react";
import { DEFAULT_WORKTREE_ROOT, useSettings } from "../state/app-settings-provider";

export function SettingsWorktreesRoute() {
  const { worktreeRoot, setWorktreeRoot } = useSettings();
  const [draft, setDraft] = useState(worktreeRoot);

  const normalizedDraft = draft.trim();
  const hasChanges = normalizedDraft.length > 0 && normalizedDraft !== worktreeRoot;

  const previewPath = useMemo(() => {
    const root = normalizedDraft.length > 0 ? normalizedDraft : worktreeRoot;
    return `${root}/sydney--2c1b1211`;
  }, [normalizedDraft, worktreeRoot]);

  return (
    <div className="flex flex-1 justify-center overflow-y-auto p-8">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Worktrees
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Choose where new workspace worktrees are created.
        </p>

        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <label htmlFor="worktree-root" className="text-sm font-medium text-[var(--foreground)]">
            Worktree root path
          </label>
          <input
            id="worktree-root"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
            placeholder={DEFAULT_WORKTREE_ROOT}
          />

          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Supports <code className="font-mono">~</code>. Existing workspaces stay where they are;
            this applies to new workspaces only.
          </p>

          <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              Preview
            </p>
            <p className="mt-1 break-all font-mono text-xs text-[var(--foreground)]">
              {previewPath}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWorktreeRoot(normalizedDraft)}
              disabled={!hasChanges}
              className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(DEFAULT_WORKTREE_ROOT);
                setWorktreeRoot(DEFAULT_WORKTREE_ROOT);
              }}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              Reset to default
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
