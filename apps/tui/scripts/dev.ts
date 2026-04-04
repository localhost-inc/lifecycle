import { ensureBridge } from "@lifecycle/bridge";
import { spawnSync } from "node:child_process";

const { port } = await ensureBridge();
const url = `http://127.0.0.1:${port}`;

console.log(`Bridge running on ${url}`);

spawnSync("cargo", ["watch", "-w", "src", "-c", "--no-process-group", "-s", "cargo run -p lifecycle-tui; stty sane"], {
  stdio: "inherit",
  env: { ...process.env, LIFECYCLE_BRIDGE_URL: url },
});
