import { WorkspacePaneTree } from "@/features/workspaces/canvas/panes/workspace-pane-tree";
import {
  useWorkspaceCanvasController,
  type WorkspaceCanvasControllerInput,
} from "@/features/workspaces/canvas/workspace-canvas-controller";

export function WorkspaceCanvas(controllerInput: WorkspaceCanvasControllerInput) {
  const controller = useWorkspaceCanvasController(controllerInput);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {controller.error && (
        <div className="border-b border-[var(--destructive)]/24 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
          {controller.error}
        </div>
      )}

      <WorkspacePaneTree actions={controller.treeActions} model={controller.treeModel} />
    </div>
  );
}
