import { LocalWorkspaceProvider } from "../../../../packages/runtime/src/local-provider.ts";
import { invokeTauri } from "./tauri-error";

let localWorkspaceProvider: LocalWorkspaceProvider | null = null;

export function getWorkspaceProvider(): LocalWorkspaceProvider {
  localWorkspaceProvider ??= new LocalWorkspaceProvider((command, args) =>
    invokeTauri(command, args),
  );
  return localWorkspaceProvider;
}
