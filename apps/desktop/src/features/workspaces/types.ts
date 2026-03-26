import type { WorkspaceHost } from "@lifecycle/contracts";

export type WorkspaceCreateMode = Extract<WorkspaceHost, "docker" | "local">;
