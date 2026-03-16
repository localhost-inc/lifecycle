import { useCallback } from "react";
import { useMemo } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import type { ProjectRouteOutletContext } from "../../projects/routes/project-route";
import { WorkspaceTabContent } from "../components/workspace-tab-content";
import {
  readWorkspaceRoutePresentationState,
  writeWorkspaceRouteDialogState,
  type WorkspaceRouteDialogState,
} from "./workspace-route-query-state";

export function WorkspaceRoute() {
  const { workspaceId } = useParams();
  useOutletContext<ProjectRouteOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const presentationState = useMemo(
    () => readWorkspaceRoutePresentationState(searchParams),
    [searchParams],
  );

  const setRouteDialog = useCallback(
    (dialog: WorkspaceRouteDialogState) => {
      setSearchParams(
        (current) => writeWorkspaceRouteDialogState(current, dialog),
        { replace: presentationState.dialog !== null },
      );
    },
    [presentationState.dialog, setSearchParams],
  );

  if (!workspaceId) {
    return null;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1" data-slot="workspace">
      <WorkspaceTabContent
        routeDialog={presentationState.dialog}
        onRouteDialogChange={setRouteDialog}
        workspaceId={workspaceId}
      />
    </div>
  );
}
