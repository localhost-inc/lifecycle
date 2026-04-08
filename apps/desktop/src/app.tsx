import { AuthSessionProvider } from "@lifecycle/auth/react";
import { isTauri } from "@tauri-apps/api/core";
import { StrictMode, useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import type { AgentClientRegistry } from "@lifecycle/agents";
import type {
  AgentMessageCollectionRegistry,
  AgentSessionCollectionRegistry,
} from "@lifecycle/store";
import { AgentClientRegistryProvider } from "@lifecycle/agents/react";
import type { WorkspaceClientRegistry } from "@lifecycle/workspace";
import { WorkspaceClientRegistryProvider } from "@lifecycle/workspace/react";
import { RootErrorBoundary } from "@/app/root-error-boundary";
import { router } from "@/app/router";
import { ShortcutRouterProvider } from "@/app/shortcuts/shortcut-router";
import { authClient } from "@/features/auth/client";
import { ProcessEventBridge } from "@/features/events/process-event-bridge";
import { AppNotifier } from "@/features/notifications/app-notifier";
import { RepositoryManifestWatcher } from "@/features/repositories/components/repository-manifest-watcher";
import { getLifecycleErrorMessage } from "@/lib/tauri-error";
import { SettingsProvider } from "@/features/settings/state/settings-provider";
import { markPerformance, measurePerformance } from "@/lib/performance";
import { ReactQueryProvider } from "@/store/react-query-provider";
import { StoreProvider } from "@/store/provider";
import { db } from "@/lib/db";

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
  agentClientRegistry: AgentClientRegistry;
  agentMessageRegistry: AgentMessageCollectionRegistry;
  agentSessionRegistry: AgentSessionCollectionRegistry;
  workspaceClientRegistry: WorkspaceClientRegistry;
}

export function App({
  agentClientRegistry,
  agentMessageRegistry,
  agentSessionRegistry,
  workspaceClientRegistry,
}: AppProps) {
  return (
    <StrictMode>
      <RootErrorBoundary>
        <SettingsProvider>
          <BootstrapPerfMarker />
          <ContextMenuBlocker />
          <WorkspaceClientRegistryProvider workspaceClientRegistry={workspaceClientRegistry}>
            <AgentClientRegistryProvider agentClientRegistry={agentClientRegistry}>
              <StoreProvider
                agentMessageRegistry={agentMessageRegistry}
                agentSessionRegistry={agentSessionRegistry}
                driver={db}
              >
                <ReactQueryProvider>
                  <AuthSessionProvider
                    client={authClient}
                    getErrorMessage={getLifecycleErrorMessage}
                    refreshIntervalMs={import.meta.env.DEV ? 5_000 : 60_000}
                  >
                    <ProcessEventBridge />
                    <RepositoryManifestWatcher />
                    <AppNotifier />
                    <ShortcutRouterProvider>
                      <RouterProvider router={router} />
                    </ShortcutRouterProvider>
                  </AuthSessionProvider>
                </ReactQueryProvider>
              </StoreProvider>
            </AgentClientRegistryProvider>
          </WorkspaceClientRegistryProvider>
        </SettingsProvider>
      </RootErrorBoundary>
    </StrictMode>
  );
}
