import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@lifecycle/ui";
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

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Worktree root</CardTitle>
            <CardDescription>Choose where new workspace worktrees are created.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <Label htmlFor="worktree-root">Worktree root path</Label>
              <Input
                id="worktree-root"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={DEFAULT_WORKTREE_ROOT}
              />
            </div>

            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Supports <code className="font-mono">~</code>. Existing workspaces stay where they
              are; this applies to new workspaces only.
            </p>

            <div className="mt-4 border border-[var(--border)] bg-[var(--background)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                Preview
              </p>
              <p className="mt-1 break-all font-mono text-xs text-[var(--foreground)]">
                {previewPath}
              </p>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
