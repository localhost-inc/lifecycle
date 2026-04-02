/**
 * Workspace creation policy — computes all record fields from user intent.
 */

import type { WorkspaceCheckoutType, WorkspaceHost } from "@lifecycle/contracts";
import { autoWorkspaceName, workspaceBranchName } from "./workspace-names";

export interface WorkspaceCreatePolicy {
  workspaceId: string;
  repositoryId: string;
  repositoryPath: string;
  name: string;
  nameOrigin: "manual" | "default";
  sourceRef: string;
  sourceRefOrigin: "manual" | "default";
  checkoutType: WorkspaceCheckoutType;
  host: WorkspaceHost;
  baseRef?: string | null | undefined;
  worktreeRoot?: string | null | undefined;
  manifestJson?: string | null | undefined;
  manifestFingerprint?: string | null | undefined;
}

export interface WorkspaceCreatePolicyInput {
  host: WorkspaceHost;
  checkoutType?: WorkspaceCheckoutType | undefined;
  repositoryId: string;
  repositoryPath: string;
  workspaceName?: string | null | undefined;
  baseRef?: string | null | undefined;
  worktreeRoot?: string | null | undefined;
  manifestJson?: string | null | undefined;
  manifestFingerprint?: string | null | undefined;
  currentBranch?: string | null | undefined;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function computeWorkspaceCreatePolicy(
  input: WorkspaceCreatePolicyInput,
): WorkspaceCreatePolicy {
  const workspaceId = crypto.randomUUID();
  const checkoutType = input.checkoutType ?? "worktree";
  const isRoot = checkoutType === "root";

  const userProvidedName = normalizeOptionalString(input.workspaceName);

  const name = userProvidedName ?? (isRoot ? "Root" : autoWorkspaceName(workspaceId));
  const nameOrigin: "manual" | "default" = isRoot || userProvidedName ? "manual" : "default";

  const sourceRef = isRoot
    ? (input.currentBranch ?? input.baseRef ?? "main")
    : workspaceBranchName(name, workspaceId);
  const sourceRefOrigin: "manual" | "default" = isRoot ? "manual" : "default";

  return {
    workspaceId,
    repositoryId: input.repositoryId,
    repositoryPath: input.repositoryPath,
    name,
    nameOrigin,
    sourceRef,
    sourceRefOrigin,
    checkoutType,
    host: input.host,
    baseRef: normalizeOptionalString(input.baseRef),
    worktreeRoot: normalizeOptionalString(input.worktreeRoot),
    manifestJson: input.manifestJson,
    manifestFingerprint: input.manifestFingerprint,
  };
}
