import type { TerminalRecord } from "@lifecycle/contracts";
import { useWorkspaceTerminals as useStoreWorkspaceTerminals } from "@/store";

export function useWorkspaceTerminals(workspaceId: string | null): TerminalRecord[] {
  // The store hook requires a non-null workspaceId, so we pass an empty string
  // as a sentinel when null. The store will return all terminals and filter by
  // workspace_id, so an empty string simply yields an empty array.
  return useStoreWorkspaceTerminals(workspaceId ?? "");
}
