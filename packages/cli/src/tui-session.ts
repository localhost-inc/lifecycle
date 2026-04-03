import { basename } from "node:path";
import type { WorkspaceRecord } from "@lifecycle/contracts";

import { createWorkspaceStatusRequest, requestBridge } from "./bridge";
import { createClient } from "./rpc-client";
import { getWorkspaceClientRegistry } from "./workspace-registry";

const BRIDGE_ENV = "LIFECYCLE_BRIDGE_SOCKET";
const WORKSPACE_ID_ENV = "LIFECYCLE_WORKSPACE_ID";
const WORKSPACE_PATH_ENV = "LIFECYCLE_WORKSPACE_PATH";
const REPO_NAME_ENV = "LIFECYCLE_REPO_NAME";

type WorkspaceBinding = "bound" | "adhoc";
type WorkspaceHost = "local" | "docker" | "cloud" | "remote" | "unknown";

type ServiceSummary = {
  name: string;
  preview_url: string | null;
  status: string;
};

export type WorkspaceScope = {
  binding: WorkspaceBinding;
  workspace_id: string | null;
  workspace_name: string;
  repo_name: string | null;
  host: WorkspaceHost;
  status: string | null;
  source_ref: string | null;
  cwd: string | null;
  worktree_path: string | null;
  services: ServiceSummary[];
  resolution_note: string | null;
  resolution_error: string | null;
};

type ShellLaunchSpec = {
  program: string;
  args: string[];
  cwd: string | null;
  env: Array<[string, string]>;
};

type ShellRuntime = {
  backend_label: string;
  launch_error: string | null;
  persistent: boolean;
  session_name: string | null;
  prepare?: ShellLaunchSpec | null;
  spec: ShellLaunchSpec | null;
};

export type TuiSession = {
  shell: ShellRuntime;
  workspace: WorkspaceScope;
};

export async function resolveTuiSession(input: {
  cwd?: string;
  env: NodeJS.ProcessEnv;
  workspaceId?: string;
}): Promise<TuiSession> {
  const explicitCwd = nonEmpty(input.cwd);
  const envWorkspacePath = nonEmpty(input.env[WORKSPACE_PATH_ENV]);
  const cwdHint = explicitCwd ?? envWorkspacePath ?? process.cwd();
  const workspaceId = nonEmpty(input.workspaceId) ?? nonEmpty(input.env[WORKSPACE_ID_ENV]);

  const workspace = workspaceId
    ? await resolveBoundWorkspace({
        cwdHint,
        env: input.env,
        explicitCwd,
        workspaceId,
      })
    : resolveAdHocWorkspace(cwdHint);

  return {
    shell: await buildShellRuntime(workspace),
    workspace,
  };
}

async function resolveBoundWorkspace(input: {
  cwdHint: string;
  env: NodeJS.ProcessEnv;
  explicitCwd: string | null;
  workspaceId: string;
}): Promise<WorkspaceScope> {
  const repoName = nonEmpty(input.env[REPO_NAME_ENV]);

  const cloudShell = await readCloudShell(input.workspaceId);
  if (cloudShell) {
    const cwd = cloudShell.cwd ?? input.cwdHint;
    return {
      binding: "bound",
      workspace_id: input.workspaceId,
      workspace_name: input.workspaceId,
      repo_name: repoName,
      host: "cloud",
      status: "active",
      source_ref: null,
      cwd,
      worktree_path: cwd,
      services: [],
      resolution_note: "Bound to the cloud workspace shell attach path for this workspace.",
      resolution_error: null,
    };
  }

  if (input.env[BRIDGE_ENV]) {
    try {
      const response = await requestBridge(
        createWorkspaceStatusRequest({ workspaceId: input.workspaceId }),
      );
      return {
        binding: "bound",
        workspace_id: response.result.workspace.id,
        workspace_name: response.result.workspace.name,
        repo_name: repoName,
        host: normalizeHost(response.result.workspace.host),
        status: response.result.workspace.status,
        source_ref: response.result.workspace.source_ref,
        cwd: response.result.workspace.worktree_path ?? input.cwdHint,
        worktree_path: response.result.workspace.worktree_path,
        services: response.result.services.map((service) => ({
          name: service.name,
          preview_url: service.preview_url,
          status: service.status,
        })),
        resolution_note: "Bound to the current workspace scope resolved through Lifecycle.",
        resolution_error: null,
      };
    } catch {
      // Fall through to path-based resolution below.
    }
  }

  if (input.explicitCwd || nonEmpty(input.env[WORKSPACE_PATH_ENV])) {
    return {
      binding: "bound",
      workspace_id: input.workspaceId,
      workspace_name: input.workspaceId,
      repo_name: repoName,
      host: "local",
      status: null,
      source_ref: null,
      cwd: input.cwdHint,
      worktree_path: input.cwdHint,
      services: [],
      resolution_note:
        "Lifecycle could not read workspace metadata, so the TUI is using the bound workspace path from the environment.",
      resolution_error: null,
    };
  }

  return {
    binding: "bound",
    workspace_id: input.workspaceId,
    workspace_name: input.workspaceId,
    repo_name: repoName,
    host: "unknown",
    status: null,
    source_ref: null,
    cwd: null,
    worktree_path: null,
    services: [],
    resolution_note: null,
    resolution_error: `Lifecycle could not resolve a bound shell attach path for workspace "${input.workspaceId}". Launch the TUI from a Lifecycle workspace session or use \`lifecycle tui ${input.workspaceId}\` from an environment that can resolve that workspace.`,
  };
}

function resolveAdHocWorkspace(cwd: string): WorkspaceScope {
  return {
    binding: "adhoc",
    workspace_id: null,
    workspace_name: basename(cwd) || "workspace",
    repo_name: nonEmpty(process.env[REPO_NAME_ENV]),
    host: "local",
    status: null,
    source_ref: null,
    cwd,
    worktree_path: cwd,
    services: [],
    resolution_note:
      "Running in ad hoc local mode. Bind a Lifecycle workspace id to unify shell and workspace-side status.",
    resolution_error: null,
  };
}

async function buildShellRuntime(workspace: WorkspaceScope): Promise<ShellRuntime> {
  if (workspace.resolution_error) {
    return {
      backend_label: "unavailable",
      launch_error: workspace.resolution_error,
      persistent: false,
      session_name: null,
      prepare: null,
      spec: null,
    };
  }

  const record = toWorkspaceRecord(workspace);
  if (!record) {
    return {
      backend_label: "unknown shell",
      launch_error:
        "Lifecycle could not resolve a supported shell launch path for this workspace host.",
      persistent: false,
      session_name: null,
      prepare: null,
      spec: null,
    };
  }

  try {
    const runtime = await getWorkspaceClientRegistry().resolve(record.host).resolveShellRuntime(
      record,
      {
        cwd: workspace.cwd ?? workspace.worktree_path,
        sessionName: buildTmuxSessionName(workspace),
      },
    );

    return {
      backend_label: runtime.backendLabel,
      launch_error: runtime.launchError,
      persistent: runtime.persistent,
      session_name: runtime.sessionName,
      prepare: runtime.prepare,
      spec: runtime.spec,
    };
  } catch (error) {
    return {
      backend_label: `${workspace.host} shell`,
      launch_error: error instanceof Error ? error.message : String(error),
      persistent: false,
      session_name: null,
      prepare: null,
      spec: null,
    };
  }
}

async function readCloudShell(workspaceId: string): Promise<{ cwd?: string | null } | null> {
  try {
    const client = createClient();
    const response = await client.workspaces[":workspaceId"].shell.$get({
      param: { workspaceId },
    });
    if (!response.ok) {
      return null;
    }
    const result = await response.json();
    return { cwd: result.cwd };
  } catch {
    return null;
  }
}

export function buildTmuxSessionName(workspace: WorkspaceScope): string {
  const hostSlug = truncateSlug(slugify(workspace.host), 12);

  const identitySlug =
    nonEmpty(workspace.workspace_id)
      ? slugify(workspace.workspace_id!)
      : slugify(
          nonEmpty(workspace.workspace_name) ??
            nonEmpty(workspace.cwd ? basename(workspace.cwd) : null) ??
            "workspace",
        );

  const readableSlug = nonEmpty(workspace.repo_name)
    ? (() => {
        const repo = slugify(workspace.repo_name!);
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

function toWorkspaceRecord(workspace: WorkspaceScope): WorkspaceRecord | null {
  const cwd = workspace.cwd ?? workspace.worktree_path ?? null;

  switch (workspace.host) {
    case "cloud":
      return workspace.workspace_id
        ? stubWorkspaceRecord("cloud", workspace.workspace_id, workspace.workspace_name, cwd)
        : null;
    case "docker":
      return workspace.workspace_id
        ? stubWorkspaceRecord("docker", workspace.workspace_id, workspace.workspace_name, cwd)
        : null;
    case "local":
      return stubWorkspaceRecord(
        "local",
        workspace.workspace_id ?? "adhoc-local",
        workspace.workspace_name,
        cwd,
      );
    case "remote":
      return workspace.workspace_id
        ? stubWorkspaceRecord("remote", workspace.workspace_id, workspace.workspace_name, cwd)
        : null;
    default:
      return null;
  }
}

function stubWorkspaceRecord(
  host: "cloud" | "docker" | "local" | "remote",
  id: string,
  name: string,
  worktreePath: string | null,
): WorkspaceRecord {
  return {
    id,
    repository_id: "tui",
    name,
    checkout_type: "worktree",
    source_ref: "tui",
    git_sha: null,
    worktree_path: worktreePath,
    host,
    manifest_fingerprint: null,
    created_at: "",
    updated_at: "",
    last_active_at: "",
    prepared_at: null,
    status: "active",
    failure_reason: null,
    failed_at: null,
  };
}

function normalizeHost(host: string): WorkspaceHost {
  switch (host.trim().toLowerCase()) {
    case "local":
    case "docker":
    case "cloud":
    case "remote":
      return host.trim().toLowerCase() as WorkspaceHost;
    default:
      return "unknown";
  }
}

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
