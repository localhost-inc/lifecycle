export type {
  ArchiveWorkspaceInput,
  EnsureWorkspaceInput,
  GitDiffInput,
  OpenInAppId,
  RenameWorkspaceInput,
  WorkspaceClient,
  WorkspaceArchiveDisposition,
  WorkspaceOpenInAppInfo,
  SubscribeWorkspaceFileEventsInput,
  WorkspaceFileEvent,
  WorkspaceFileEventListener,
  WorkspaceFileEventSubscription,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
  WorkspaceClientRegistry,
  WorkspaceClientRegistryClients,
  ManifestStatus,
  ManifestFileReader,
} from "./client";
export { createWorkspaceClientRegistry } from "./client";
export { LocalWorkspaceClient, type LocalClientDeps } from "./clients/local";
export { workspaceHostLabel } from "./policy";
