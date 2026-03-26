import { isTauri } from "@tauri-apps/api/core";
import { StrictMode, useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import type { AgentOrchestrator } from "@lifecycle/agents";
import type { WorkspaceHostClientRegistry } from "@lifecycle/workspace/client";
import { RootErrorBoundary } from "@/app/root-error-boundary";
import { router } from "@/app/router";
import { ShortcutRouterProvider } from "@/app/shortcuts/shortcut-router";
import { AuthSessionProvider } from "@/features/auth/state/auth-session-provider";
import { AgentOrchestratorProvider } from "@/features/agents/provider";
import { AppNotifier } from "@/features/notifications/app-notifier";
import { ProjectManifestWatcher } from "@/features/projects/components/project-manifest-watcher";
import { SettingsProvider } from "@/features/settings/state/settings-provider";
import { markPerformance, measurePerformance } from "@/lib/performance";
import { ReactQueryProvider } from "@/store/react-query-provider";
import { StoreProvider } from "@/store/provider";
import { tauriSqlDriver } from "@/lib/sql-driver";
import { WorkspaceHostClientProvider } from "@lifecycle/workspace/client/react";

function BootstrapPerfMarker() {
  useEffect(() => {
    markPerformance("bootstrap:ready");
    measurePerformance("bootstrap", "bootstrap:start", "bootstrap:ready");
  }, []);

  return null;
}

function ContextMenuBlocker() {
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", handleContextMenu, true);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, []);

  return null;
}

interface AppProps {
  agentOrchestrator: AgentOrchestrator;
  workspaceHostClientRegistry: WorkspaceHostClientRegistry;
}

export function App({ agentOrchestrator, workspaceHostClientRegistry }: AppProps) {
  return (
    <StrictMode>
      <RootErrorBoundary>
        <SettingsProvider>
          <BootstrapPerfMarker />
          <ContextMenuBlocker />
          <WorkspaceHostClientProvider workspaceHostClientRegistry={workspaceHostClientRegistry}>
            <AgentOrchestratorProvider agentOrchestrator={agentOrchestrator}>
              <StoreProvider driver={tauriSqlDriver}>
                <ReactQueryProvider>
                  <AuthSessionProvider>
                    <ProjectManifestWatcher />
                    <AppNotifier />
                    <ShortcutRouterProvider>
                      <RouterProvider router={router} />
                    </ShortcutRouterProvider>
                  </AuthSessionProvider>
                </ReactQueryProvider>
              </StoreProvider>
            </AgentOrchestratorProvider>
          </WorkspaceHostClientProvider>
        </SettingsProvider>
      </RootErrorBoundary>
    </StrictMode>
  );
}
