import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  createOpenSurfaceRequest,
  type OpenSurfaceInput,
  type OpenSurfaceRequest,
} from "@/features/workspaces/canvas/workspace-canvas-requests";

interface WorkspaceOpenRequestsContextValue {
  clearTabRequest: (workspaceId: string, requestId: string) => void;
  openTab: (workspaceId: string, request: OpenSurfaceInput) => void;
  requestsByWorkspaceId: Record<string, OpenSurfaceRequest | null>;
}

const WorkspaceOpenRequestsContext = createContext<WorkspaceOpenRequestsContextValue | null>(null);

export function WorkspaceOpenRequestsProvider({ children }: { children: ReactNode }) {
  const [requestsByWorkspaceId, setRequestsByWorkspaceId] = useState<
    Record<string, OpenSurfaceRequest | null>
  >({});

  const openTab = useCallback((workspaceId: string, request: OpenSurfaceInput) => {
    const nextRequest = createOpenSurfaceRequest(request);

    setRequestsByWorkspaceId((current) => {
      return {
        ...current,
        [workspaceId]: nextRequest,
      };
    });
  }, []);

  const clearTabRequest = useCallback((workspaceId: string, requestId: string) => {
    setRequestsByWorkspaceId((current) => {
      if (current[workspaceId]?.id !== requestId) {
        return current;
      }

      const next = { ...current };
      delete next[workspaceId];
      return next;
    });
  }, []);

  const value = useMemo<WorkspaceOpenRequestsContextValue>(
    () => ({
      clearTabRequest,
      openTab,
      requestsByWorkspaceId,
    }),
    [clearTabRequest, openTab, requestsByWorkspaceId],
  );

  return (
    <WorkspaceOpenRequestsContext.Provider value={value}>
      {children}
    </WorkspaceOpenRequestsContext.Provider>
  );
}

export function useWorkspaceOpenRequests(): WorkspaceOpenRequestsContextValue {
  const value = useContext(WorkspaceOpenRequestsContext);
  if (!value) {
    throw new Error("useWorkspaceOpenRequests must be used within a WorkspaceOpenRequestsProvider");
  }

  return value;
}
