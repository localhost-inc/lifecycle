import { useEffect, useRef } from "react";
import {
  writeWorkspaceCanvasState,
  type WorkspaceCanvasState,
} from "@/features/workspaces/state/workspace-canvas-state";

export function useWorkspaceCanvasPersistence(
  workspaceId: string,
  state: WorkspaceCanvasState,
): void {
  const stateRef = useRef(state);
  stateRef.current = state;

  // Debounced write — coalesces rapid state changes into a single persist.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      writeWorkspaceCanvasState(workspaceId, state);
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [state, workspaceId]);

  // Flush on page unload so the latest state is never lost.
  useEffect(() => {
    const flush = () => writeWorkspaceCanvasState(workspaceId, stateRef.current);
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [workspaceId]);
}
