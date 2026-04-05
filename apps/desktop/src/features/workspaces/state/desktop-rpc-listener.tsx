import { DesktopRpcShellRequestSchema, type DesktopRpcShellRequest } from "@lifecycle/contracts";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPreviewOpenInput } from "@/features/workspaces/canvas/workspace-canvas-requests";
import { useWorkspaceOpenRequests } from "@/features/workspaces/state/workspace-open-requests";

const DESKTOP_RPC_SHELL_REQUEST_EVENT = "desktop-rpc:shell-request";

function buildPreviewResult(
  request: Extract<DesktopRpcShellRequest, { kind: "tab.open.preview" }>,
) {
  return {
    repositoryId: request.repositoryId,
    surface: "preview",
    tabKey: `preview:${request.previewKey}`,
    url: request.url,
    workspaceId: request.workspaceId,
  };
}

export function DesktopRpcListener() {
  const navigate = useNavigate();
  const { openTab } = useWorkspaceOpenRequests();

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let cancelled = false;
    let dispose: (() => void) | undefined;

    void listen<DesktopRpcShellRequest>(DESKTOP_RPC_SHELL_REQUEST_EVENT, async (event) => {
      if (cancelled) {
        return;
      }

      const parsed = DesktopRpcShellRequestSchema.safeParse(event.payload);
      if (!parsed.success) {
        return;
      }

      const request = parsed.data;

      try {
        if (request.kind === "tab.open.preview") {
          openTab(
            request.workspaceId,
            createPreviewOpenInput({
              label: request.label,
              previewKey: request.previewKey,
              url: request.url,
            }),
          );
          void navigate(`/repositories/${request.repositoryId}/workspaces/${request.workspaceId}`);
          await invoke("desktop_rpc_complete_shell_request", {
            requestId: request.requestId,
            result: buildPreviewResult(request),
          });
        }
      } catch (error) {
        await invoke("desktop_rpc_fail_shell_request", {
          error: {
            code: "desktop_rpc_request_failed",
            message: error instanceof Error ? error.message : String(error),
          },
          requestId: request.requestId,
        });
      }
    }).then((unlisten) => {
      dispose = unlisten;
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [navigate, openTab]);

  return null;
}
