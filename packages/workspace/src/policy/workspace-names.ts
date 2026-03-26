/**
 * Workspace naming utilities — auto-naming, branch name derivation, slugification.
 *
 * These are pure functions that mirror (and replace) the logic previously
 * embedded in the Rust create.rs and worktree.rs modules.
 */

const ADJECTIVES = [
  "amber",
  "arctic",
  "ashen",
  "azure",
  "birch",
  "blaze",
  "brisk",
  "calm",
  "cedar",
  "clear",
  "cobalt",
  "coral",
  "crisp",
  "dusk",
  "ember",
  "fern",
  "flint",
  "frost",
  "gilt",
  "glint",
  "haze",
  "hollow",
  "hushed",
  "iron",
  "ivory",
  "jade",
  "keen",
  "lapis",
  "lunar",
  "maple",
  "misty",
  "moss",
  "north",
  "onyx",
  "pale",
  "pine",
  "quiet",
  "rapid",
  "reed",
  "ridge",
  "sage",
  "slate",
  "solar",
  "stark",
  "still",
  "swift",
  "tidal",
  "vast",
] as const;

const NOUNS = [
  "alcove",
  "arch",
  "atlas",
  "basin",
  "beacon",
  "bluff",
  "canal",
  "cove",
  "delta",
  "drift",
  "dune",
  "echo",
  "fjord",
  "flume",
  "forge",
  "glen",
  "gorge",
  "grove",
  "harbor",
  "haven",
  "isle",
  "junction",
  "keystone",
  "lagoon",
  "ledge",
  "loft",
  "marsh",
  "meadow",
  "mesa",
  "moraine",
  "narrows",
  "orbit",
  "outcrop",
  "pass",
  "pier",
  "plinth",
  "quarry",
  "ravine",
  "reef",
  "ridge",
  "shoal",
  "spire",
  "summit",
  "terrace",
  "vale",
  "vertex",
  "wharf",
  "zenith",
] as const;

/**
 * Generate a deterministic workspace name from a UUID string.
 * Uses the first two bytes of the UUID to index into adjective/noun tables.
 */
export function autoWorkspaceName(workspaceId: string): string {
  const byte0 = workspaceId.charCodeAt(0) || 0;
  const byte1 = workspaceId.charCodeAt(1) || 0;
  const adjective = ADJECTIVES[byte0 % ADJECTIVES.length];
  const noun = NOUNS[byte1 % NOUNS.length];
  return `${adjective}-${noun}`;
}

/**
 * Slugify a workspace name for use in branch names and directory names.
 * Alphanumeric → lowercase, separators → dash, collapse runs, trim dashes.
 */
export function slugifyWorkspaceName(value: string): string {
  let slug = "";
  let previousDash = false;

  for (const ch of value) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      slug += ch.toLowerCase();
      previousDash = false;
    } else if (" -_/.".includes(ch)) {
      if (slug.length > 0 && !previousDash) {
        slug += "-";
        previousDash = true;
      }
    }
  }

  while (slug.endsWith("-")) {
    slug = slug.slice(0, -1);
  }

  return slug || "workspace";
}

/**
 * Extract a short alphanumeric prefix from a workspace ID for uniqueness.
 */
export function shortWorkspaceId(workspaceId: string): string {
  let result = "";
  for (const ch of workspaceId) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      result += ch;
      if (result.length >= 8) break;
    }
  }
  return result || "workspace";
}

/**
 * Derive the git branch name for a workspace: `lifecycle/{name-slug}-{short-id}`.
 */
export function workspaceBranchName(workspaceName: string, workspaceId: string): string {
  const nameSlug = slugifyWorkspaceName(workspaceName);
  const shortId = shortWorkspaceId(workspaceId);
  return `lifecycle/${nameSlug}-${shortId}`;
}

/**
 * Check whether a branch ref is a lifecycle worktree branch for a given workspace.
 */
export function isLifecycleWorktreeBranch(sourceRef: string, workspaceId: string): boolean {
  const slug = sourceRef.startsWith("lifecycle/") ? sourceRef.slice("lifecycle/".length) : null;
  if (slug === null) return false;

  const shortId = shortWorkspaceId(workspaceId);
  const suffix = `-${shortId}`;
  if (!slug.endsWith(suffix)) return false;

  const nameSlug = slug.slice(0, -suffix.length);
  if (nameSlug.length === 0) return false;

  return [...nameSlug].every((ch) => /[a-z0-9-]/.test(ch));
}
