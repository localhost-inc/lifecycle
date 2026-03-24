import { isTauri } from "@tauri-apps/api/core";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { RootErrorBoundary } from "@/app/root-error-boundary";
import { ShortcutRouterProvider } from "@/app/shortcuts/shortcut-router";
import { router } from "@/app/router";
import { AuthSessionProvider } from "@/features/auth/state/auth-session-provider";
import { TurnNotificationListener } from "@/features/notifications/turn-notification-listener";
import { ProjectManifestWatcher } from "@/features/projects/components/project-manifest-watcher";
import { SettingsProvider } from "@/features/settings/state/settings-provider";
import { createAgentOrchestrator } from "@/features/agents/orchestrator";
import { TerminalResponseReadyProvider } from "@/features/terminals/state/terminal-response-ready-provider";
import { markPerformance, measurePerformance } from "@/lib/performance";
import { watch } from "@tauri-apps/plugin-fs";
import { LocalRuntime } from "@lifecycle/workspace";
import { StoreProvider } from "@/store/provider";
import { ReactQueryProvider } from "@/store/react-query-provider";
import { tauriSqlDriver } from "@/lib/sql-driver";
import { invokeTauri } from "@/lib/tauri-error";
import "@/main.css";

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

markPerformance("bootstrap:start");

// Preserve runtime and orchestrator (which holds live worker Child handles)
// across Vite HMR so agent sessions survive hot reloads.
let localRuntime: LocalRuntime;
let agentOrchestrator: ReturnType<typeof createAgentOrchestrator>;

if (import.meta.hot?.data.localRuntime) {
  localRuntime = import.meta.hot.data.localRuntime;
  agentOrchestrator = import.meta.hot.data.agentOrchestrator;
} else {
  localRuntime = new LocalRuntime({
    invoke: (command, args) => invokeTauri(command, args),
    watchPath: (path, callback, options) => watch(path, callback, options),
  });
  agentOrchestrator = createAgentOrchestrator(localRuntime);
}

if (import.meta.hot) {
  import.meta.hot.data.localRuntime = localRuntime;
  import.meta.hot.data.agentOrchestrator = agentOrchestrator;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <SettingsProvider>
        <BootstrapPerfMarker />
        <ContextMenuBlocker />
        <StoreProvider agentOrchestrator={agentOrchestrator} driver={tauriSqlDriver} runtime={localRuntime}>
          <ReactQueryProvider>
            <AuthSessionProvider>
              <ProjectManifestWatcher />
              <TurnNotificationListener />
              <TerminalResponseReadyProvider>
                <ShortcutRouterProvider>
                  <RouterProvider router={router} />
                </ShortcutRouterProvider>
              </TerminalResponseReadyProvider>
            </AuthSessionProvider>
          </ReactQueryProvider>
        </StoreProvider>
      </SettingsProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
