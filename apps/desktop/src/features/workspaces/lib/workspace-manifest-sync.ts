import {
  getManifestFingerprint,
  type LifecycleConfig,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import type { ManifestStatus } from "../../projects/api/projects";

function countDeclaredServices(config: LifecycleConfig | null): number {
  if (!config) {
    return 0;
  }

  return Object.values(config.environment).filter((node) => node.kind === "service").length;
}

export function shouldSyncWorkspaceManifest(
  workspace: Pick<WorkspaceRecord, "manifest_fingerprint" | "status">,
  manifestStatus: ManifestStatus | null,
  persistedServiceCount: number,
): boolean {
  if (workspace.status !== "idle") {
    return false;
  }

  if (manifestStatus?.state === "valid") {
    const manifestFingerprint = getManifestFingerprint(manifestStatus.result.config);
    const declaredServiceCount = countDeclaredServices(manifestStatus.result.config);

    return (
      workspace.manifest_fingerprint !== manifestFingerprint ||
      (declaredServiceCount > 0 && persistedServiceCount === 0)
    );
  }

  return workspace.manifest_fingerprint !== null || persistedServiceCount > 0;
}
