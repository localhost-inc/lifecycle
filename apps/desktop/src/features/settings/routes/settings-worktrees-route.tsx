import { Button, Input } from "@lifecycle/ui";
import { useMemo, useState } from "react";
import { DEFAULT_WORKTREE_ROOT, useSettings } from "../state/app-settings-provider";
import { SettingsFieldRow, SettingsPage, SettingsSection } from "../components/settings-primitives";

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
    <SettingsPage title="Worktrees" description="Choose where new workspace worktrees are created.">
      <SettingsSection label="Worktree root">
        <SettingsFieldRow
          label="Worktree root path"
          htmlFor="worktree-root"
          description="Supports ~. Existing workspaces stay where they are; this applies to new workspaces only."
        >
          <Input
            id="worktree-root"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={DEFAULT_WORKTREE_ROOT}
          />
        </SettingsFieldRow>

        <div className="mt-4 border border-[var(--border)] bg-[var(--background)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Preview
          </p>
          <p className="mt-1 break-all font-mono text-xs text-[var(--foreground)]">{previewPath}</p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button disabled={!hasChanges} onClick={() => setWorktreeRoot(normalizedDraft)}>
            Save
          </Button>
          <Button
            onClick={() => {
              setDraft(DEFAULT_WORKTREE_ROOT);
              setWorktreeRoot(DEFAULT_WORKTREE_ROOT);
            }}
            variant="outline"
          >
            Reset to default
          </Button>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
