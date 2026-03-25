import { isTauri } from "@tauri-apps/api/core";
import { StrictMode, useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import type { AgentOrchestrator } from "@lifecycle/agents";
import type { WorkspaceClient } from "@lifecycle/workspace";
import { RootErrorBoundary } from "@/app/root-error-boundary";
import { router } from "@/app/router";
import { ShortcutRouterProvider } from "@/app/shortcuts/shortcut-router";
import { AuthSessionProvider } from "@/features/auth/state/auth-session-provider";
import { AppNotifier } from "@/features/notifications/app-notifier";
import { ProjectManifestWatcher } from "@/features/projects/components/project-manifest-watcher";
import { SettingsProvider } from "@/features/settings/state/settings-provider";
import { markPerformance, measurePerformance } from "@/lib/performance";
import { ReactQueryProvider } from "@/store/react-query-provider";
import { StoreProvider } from "@/store/provider";
import { tauriSqlDriver } from "@/lib/sql-driver";

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
  client: WorkspaceClient;
}

export function App({ agentOrchestrator, client }: AppProps) {
  return (
    <StrictMode>
      <RootErrorBoundary>
        <SettingsProvider>
          <BootstrapPerfMarker />
          <ContextMenuBlocker />
          <StoreProvider
            agentOrchestrator={agentOrchestrator}
            driver={tauriSqlDriver}
            client={client}
          >
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
        </SettingsProvider>
      </RootErrorBoundary>
    </StrictMode>
  );
}
