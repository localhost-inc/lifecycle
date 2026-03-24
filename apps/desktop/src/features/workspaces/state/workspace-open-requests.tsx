import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  createOpenDocumentRequest,
  type OpenDocumentInput,
  type OpenDocumentRequest,
} from "@/features/workspaces/canvas/workspace-canvas-requests";

interface WorkspaceOpenRequestsContextValue {
  clearDocumentRequest: (workspaceId: string, requestId: string) => void;
  openDocument: (workspaceId: string, request: OpenDocumentInput) => void;
  requestsByWorkspaceId: Record<string, OpenDocumentRequest | null>;
}

const WorkspaceOpenRequestsContext = createContext<WorkspaceOpenRequestsContextValue | null>(null);

export function WorkspaceOpenRequestsProvider({ children }: { children: ReactNode }) {
  const [requestsByWorkspaceId, setRequestsByWorkspaceId] = useState<
    Record<string, OpenDocumentRequest | null>
  >({});

  const openDocument = useCallback((workspaceId: string, request: OpenDocumentInput) => {
    const nextRequest = createOpenDocumentRequest(request);

    setRequestsByWorkspaceId((current) => {
      return {
        ...current,
        [workspaceId]: nextRequest,
      };
    });
  }, []);

  const clearDocumentRequest = useCallback((workspaceId: string, requestId: string) => {
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
      clearDocumentRequest,
      openDocument,
      requestsByWorkspaceId,
    }),
    [clearDocumentRequest, openDocument, requestsByWorkspaceId],
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
