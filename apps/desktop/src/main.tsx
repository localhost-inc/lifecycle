import { createRoot, type Root } from "react-dom/client";
import { watch } from "@tauri-apps/plugin-fs";
import { LocalClient } from "@lifecycle/workspace";
import { App } from "./app";
import { createAgentOrchestrator } from "@/features/agents/orchestrator";
import { invokeTauri } from "@/lib/tauri-error";
import { markPerformance } from "@/lib/performance";
import "@/main.css";

interface DesktopBootstrapHotData {
  agentOrchestrator?: ReturnType<typeof createAgentOrchestrator>;
  localClient?: LocalClient;
  root?: Root;
}

markPerformance("bootstrap:start");
const hotData = import.meta.hot?.data as DesktopBootstrapHotData | undefined;

// Preserve the client across HMR so Vite can refresh the app tree
// without tearing down the whole desktop shell.
const localClient =
  hotData?.localClient ??
  new LocalClient({
    invoke: (command, args) => invokeTauri(command, args),
    watchPath: (path, callback, options) => watch(path, callback, options),
  });
const agentOrchestrator = hotData?.agentOrchestrator ?? createAgentOrchestrator(localClient);

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing root container");
}

const root = hotData?.root ?? createRoot(container);

if (import.meta.hot) {
  import.meta.hot.data.localClient = localClient;
  import.meta.hot.data.agentOrchestrator = agentOrchestrator;
  import.meta.hot.data.root = root;
}

root.render(<App agentOrchestrator={agentOrchestrator} client={localClient} />);
