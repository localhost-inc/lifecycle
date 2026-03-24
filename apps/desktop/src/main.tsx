import { createRoot, type Root } from "react-dom/client";
import { watch } from "@tauri-apps/plugin-fs";
import { LocalRuntime } from "@lifecycle/workspace";
import { App } from "./app";
import { createAgentOrchestrator } from "@/features/agents/orchestrator";
import { invokeTauri } from "@/lib/tauri-error";
import { markPerformance } from "@/lib/performance";
import "@/main.css";

interface DesktopBootstrapHotData {
  agentOrchestrator?: ReturnType<typeof createAgentOrchestrator>;
  localRuntime?: LocalRuntime;
  root?: Root;
}

markPerformance("bootstrap:start");

const hotData = import.meta.hot?.data as DesktopBootstrapHotData | undefined;

// Preserve runtime/orchestrator/root across Vite HMR so the desktop shell updates
// in place instead of tearing down the whole tree and flashing the window.
const localRuntime =
  hotData?.localRuntime ??
  new LocalRuntime({
    invoke: (command, args) => invokeTauri(command, args),
    watchPath: (path, callback, options) => watch(path, callback, options),
  });

const agentOrchestrator = hotData?.agentOrchestrator ?? createAgentOrchestrator(localRuntime);

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing root container");
}

const root = hotData?.root ?? createRoot(container);

if (import.meta.hot) {
  import.meta.hot.data.localRuntime = localRuntime;
  import.meta.hot.data.agentOrchestrator = agentOrchestrator;
  import.meta.hot.data.root = root;
}

root.render(<App agentOrchestrator={agentOrchestrator} runtime={localRuntime} />);
