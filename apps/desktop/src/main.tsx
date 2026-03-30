import { createRoot, type Root } from "react-dom/client";
import { watch } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { createAgentClient, createAgentClientRegistry } from "@lifecycle/agents";
import type { AgentClientRegistry } from "@lifecycle/agents";
import { createAgentSessionHistoryObserver } from "@lifecycle/agents/internal/session-history";
import { createLocalAgentWorker } from "@lifecycle/agents/internal/local";
import { reattachActiveAgentSessions } from "@lifecycle/agents/internal/session-restore";
import { recordAgentSessionEvent } from "@lifecycle/agents/internal/session-store";
import { createEnvironmentClientRegistry } from "@lifecycle/environment";
import { LocalEnvironmentClient } from "@lifecycle/environment/internal/local";
import {
  createAgentMessageCollectionRegistry,
  createAgentSessionCollectionRegistry,
  type AgentMessageCollectionRegistry,
  type AgentSessionCollectionRegistry,
} from "@lifecycle/store";
import { createWorkspaceClientRegistry } from "@lifecycle/workspace";
import { LocalWorkspaceClient } from "@lifecycle/workspace/internal/local";
import type { WorkspaceClientRegistry } from "@lifecycle/workspace";
import { App } from "./app";
import { publishAgentLifecycleEvent } from "@/features/agents/agent-lifecycle-events";
import { db, waitForDbReady } from "@/lib/db";
import { readAppSettings } from "@/lib/config";
import { createNativeFileReader } from "@/lib/files/native-file-reader";
import { invokeTauri } from "@/lib/tauri-error";
import { markPerformance } from "@/lib/performance";
import "@/main.css";

interface DesktopBootstrapHotData {
  agentClientRegistry?: AgentClientRegistry;
  agentMessageRegistry?: AgentMessageCollectionRegistry;
  agentSessionRegistry?: AgentSessionCollectionRegistry;
  didReattachAgentSessions?: boolean;
  dockerAgentClient?: ReturnType<typeof createAgentClient>;
  localAgentWorker?: ReturnType<typeof createLocalAgentWorker>;
  localAgentClient?: ReturnType<typeof createAgentClient>;
  localWorkspaceClient?: LocalWorkspaceClient;
  root?: Root;
  workspaceClientRegistry?: WorkspaceClientRegistry;
}

markPerformance("bootstrap:start");
const hotData = import.meta.hot?.data as DesktopBootstrapHotData | undefined;

// Preserve the client across HMR so Vite can refresh the app tree
// without tearing down the whole desktop shell.
const localWorkspaceClient =
  hotData?.localWorkspaceClient ??
  new LocalWorkspaceClient({
    fileReader: createNativeFileReader((command, args) => invokeTauri(command, args)),
    invoke: (command, args) => invokeTauri(command, args),
    watchPath: (path, callback, options) => watch(path, callback, options),
  });
const dockerWorkspaceClient = localWorkspaceClient;
const workspaceClientRegistry =
  hotData?.workspaceClientRegistry ??
  createWorkspaceClientRegistry({
    docker: dockerWorkspaceClient,
    local: localWorkspaceClient,
  });
const agentMessageRegistry =
  hotData?.agentMessageRegistry ?? createAgentMessageCollectionRegistry();
const agentSessionRegistry =
  hotData?.agentSessionRegistry ?? createAgentSessionCollectionRegistry();
const localEnvironmentClient = new LocalEnvironmentClient({
  invoke: (command, args) => invokeTauri(command, args),
});
const environmentClientRegistry = createEnvironmentClientRegistry({
  docker: localEnvironmentClient,
  local: localEnvironmentClient,
});
const localAgentWorker =
  hotData?.localAgentWorker ??
  createLocalAgentWorker({
    commandRunner: {
      createCommand(args) {
        const command = Command.create("lifecycle", args);

        return {
          onClose(listener) {
            command.on("close", ({ code, signal }) => {
              listener({
                code,
                signal: signal === null ? null : String(signal),
              });
            });
          },
          onError(listener) {
            command.on("error", (error) => {
              listener(typeof error === "string" ? error : String(error));
            });
          },
          onStderrData(listener) {
            command.stderr.on("data", listener);
          },
          onStdoutData(listener) {
            command.stdout.on("data", listener);
          },
          async spawn() {
            await command.spawn();
          },
        };
      },
    },
    invoke: (command, args) => invokeTauri(command, args),
    async readHarnessSettings() {
      return (await readAppSettings()).harnesses;
    },
  });
const localAgentClient =
  hotData?.localAgentClient ??
  createAgentClient({
    agentSessionRegistry,
    agentWorker: localAgentWorker,
    driver: db,
    observers: [
      recordAgentSessionEvent,
      createAgentSessionHistoryObserver({
        agentMessageRegistry,
        agentSessionRegistry,
        driver: db,
        stateKey: "local",
      }),
      publishAgentLifecycleEvent,
    ],
    workspaceClient: localWorkspaceClient,
    workspaceHost: "local",
  });
const dockerAgentClient =
  hotData?.dockerAgentClient ??
  createAgentClient({
    agentSessionRegistry,
    agentWorker: localAgentWorker,
    driver: db,
    observers: [
      recordAgentSessionEvent,
      createAgentSessionHistoryObserver({
        agentMessageRegistry,
        agentSessionRegistry,
        driver: db,
        stateKey: "docker",
      }),
      publishAgentLifecycleEvent,
    ],
    workspaceClient: dockerWorkspaceClient,
    workspaceHost: "docker",
  });
const agentClientRegistry =
  hotData?.agentClientRegistry ??
  createAgentClientRegistry({
    docker: dockerAgentClient,
    local: localAgentClient,
  });

if (!hotData?.didReattachAgentSessions) {
  void waitForDbReady()
    .then(async () => {
      await Promise.all([
        reattachActiveAgentSessions({
          agentClient: localAgentClient,
          driver: db,
          workspaceHost: "local",
        }),
        reattachActiveAgentSessions({
          agentClient: dockerAgentClient,
          driver: db,
          workspaceHost: "docker",
        }),
      ]);
    })
    .catch((error) => {
      console.error("[db] failed to initialize the local database:", error);
    });
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing root container");
}

const root = hotData?.root ?? createRoot(container);

if (import.meta.hot) {
  import.meta.hot.data.agentClientRegistry = agentClientRegistry;
  import.meta.hot.data.agentMessageRegistry = agentMessageRegistry;
  import.meta.hot.data.agentSessionRegistry = agentSessionRegistry;
  import.meta.hot.data.didReattachAgentSessions = true;
  import.meta.hot.data.dockerAgentClient = dockerAgentClient;
  import.meta.hot.data.localWorkspaceClient = localWorkspaceClient;
  import.meta.hot.data.localAgentWorker = localAgentWorker;
  import.meta.hot.data.localAgentClient = localAgentClient;
  import.meta.hot.data.root = root;
  import.meta.hot.data.workspaceClientRegistry = workspaceClientRegistry;
}

root.render(
  <App
    agentClientRegistry={agentClientRegistry}
    agentMessageRegistry={agentMessageRegistry}
    agentSessionRegistry={agentSessionRegistry}
    environmentClientRegistry={environmentClientRegistry}
    workspaceClientRegistry={workspaceClientRegistry}
  />,
);
