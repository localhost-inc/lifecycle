import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type { StackLogScope } from "./logs/path";

export interface StartStackCallbacks {
  onServiceFailed?: (name: string) => void;
  onServiceReady?: (service: StartedService) => void;
  onServiceStarting?: (name: string) => void;
}

export interface StartStackInput {
  callbacks?: StartStackCallbacks;
  stackId: string;
  hostLabel: string;
  logScope: StackLogScope;
  name: string;
  prepared: boolean;
  readyServiceNames: string[];
  rootPath: string;
  services: ServiceRecord[];
  serviceNames?: string[];
  sourceRef: string;
}

export interface StartedService {
  assignedPort: number | null;
  name: string;
  processId: number | null;
}

export interface StartStackResult {
  preparedAt: string | null;
  startedServices: StartedService[];
}

export function createStartStackInput(input: {
  hostLabel: string;
  organizationSlug?: string | null;
  repositorySlug: string;
  serviceNames?: string[];
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
}): StartStackInput {
  if (!input.workspace.workspace_root) {
    throw new Error(`Workspace "${input.workspace.id}" has no workspace root.`);
  }

  return {
    stackId: input.workspace.id,
    hostLabel: input.hostLabel,
    logScope: {
      ...(input.organizationSlug ? { organizationSlug: input.organizationSlug } : {}),
      repositorySlug: input.repositorySlug,
      workspaceSlug: input.workspace.slug,
    },
    name: input.workspace.name,
    prepared: input.workspace.prepared_at !== null,
    readyServiceNames: input.services
      .filter((service) => service.status === "ready")
      .map((service) => service.name),
    rootPath: input.workspace.workspace_root,
    services: input.services,
    sourceRef: input.workspace.source_ref,
    ...(input.serviceNames ? { serviceNames: input.serviceNames } : {}),
  };
}
