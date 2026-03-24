import { BridgeShellRequestSchema, type BridgeShellRequest } from "@lifecycle/contracts";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createBrowserOpenInput } from "@/features/workspaces/canvas/workspace-canvas-requests";
import { useWorkspaceOpenRequests } from "@/features/workspaces/state/workspace-open-requests";

const BRIDGE_SHELL_REQUEST_EVENT = "bridge:shell-request";

function buildBrowserResult(request: Extract<BridgeShellRequest, { kind: "tab.open.browser" }>) {
  return {
    projectId: request.projectId,
    surface: "browser",
    tabKey: `browser:${request.browserKey}`,
    url: request.url,
    workspaceId: request.workspaceId,
  };
}

export function BridgeListener() {
  const navigate = useNavigate();
  const { openDocument } = useWorkspaceOpenRequests();

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let cancelled = false;
    let dispose: (() => void) | undefined;

    void listen<BridgeShellRequest>(BRIDGE_SHELL_REQUEST_EVENT, async (event) => {
      if (cancelled) {
        return;
      }

      const parsed = BridgeShellRequestSchema.safeParse(event.payload);
      if (!parsed.success) {
        return;
      }

      const request = parsed.data;

      try {
        if (request.kind === "tab.open.browser") {
          openDocument(
            request.workspaceId,
            createBrowserOpenInput({
              browserKey: request.browserKey,
              label: request.label,
              url: request.url,
            }),
          );
          void navigate(`/projects/${request.projectId}/workspaces/${request.workspaceId}`);
          await invoke("bridge_complete_shell_request", {
            requestId: request.requestId,
            result: buildBrowserResult(request),
          });
        }
      } catch (error) {
        await invoke("bridge_fail_shell_request", {
          error: {
            code: "bridge_request_failed",
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
  }, [navigate, openDocument]);

  return null;
}
