export type {
  CloudWorkspaceProviderCreateContext,
  LocalWorkspaceProviderCreateContext,
  WorkspaceProviderCreateTerminalInput,
  WorkspaceProvider,
  WorkspaceProviderCreateContext,
  WorkspaceProviderCreateInput,
  WorkspaceProviderCreateResult,
  WorkspaceProviderGitDiffInput,
  WorkspaceProviderHealthResult,
  WorkspaceProviderStartInput,
  WorkspaceProviderWakeInput,
} from "./provider";
export { LocalWorkspaceProvider } from "./workspaces/providers/local";
export { CloudWorkspaceProvider, type CloudWorkspaceClient } from "./workspaces/providers/cloud";
