export type {
  CloudWorkspaceProviderCreateContext,
  LocalWorkspaceProviderCreateContext,
  WorkspaceProviderAttachTerminalInput,
  WorkspaceProviderAttachTerminalResult,
  WorkspaceProviderCreateTerminalInput,
  WorkspaceProvider,
  WorkspaceProviderCreateContext,
  WorkspaceProviderCreateInput,
  WorkspaceProviderCreateResult,
  WorkspaceProviderHealthResult,
  WorkspaceProviderStartInput,
} from "./provider";
export { LocalWorkspaceProvider } from "./workspaces/providers/local";
export { CloudWorkspaceProvider, type CloudWorkspaceClient } from "./workspaces/providers/cloud";
