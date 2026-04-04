export function buildTmuxSessionName(workspace: {
  workspace_id?: string | null;
  workspace_name: string;
  repo_name?: string | null;
  host: string;
  cwd?: string | null;
}): string {
  const hostSlug = truncateSlug(slugify(workspace.host), 12);
  const workspaceId = nonEmpty(workspace.workspace_id ?? null);
  const repoName = nonEmpty(workspace.repo_name ?? null);

  const identitySlug = workspaceId
    ? slugify(workspaceId)
    : slugify(nonEmpty(workspace.workspace_name) ?? "workspace");

  const readableSlug = repoName
    ? (() => {
        const repo = slugify(repoName);
        const workspaceName = truncateSlug(slugify(workspace.workspace_name), 18);
        return workspaceName
          ? truncateSlug(`${repo}-${workspaceName}`, 28)
          : truncateSlug(repo, 18);
      })()
    : (() => {
        const workspaceName = truncateSlug(slugify(workspace.workspace_name), 28);
        return workspaceName || null;
      })();

  if (readableSlug) {
    return `lc-${hostSlug}-${truncateSlug(identitySlug, 24)}-${readableSlug}`;
  }

  return `lc-${hostSlug}-${truncateSlug(identitySlug, 40)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function truncateSlug(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
