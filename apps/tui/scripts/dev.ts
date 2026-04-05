import { ensureBridge, readBridgeRegistration } from "@lifecycle/bridge";
import { watch } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dir, "..", "..", "..");
const tuiRoot = path.resolve(import.meta.dir, "..");
const cliEntrypoint = path.join(projectRoot, "packages", "cli", "src", "index.ts");
const binaryPath = path.join(projectRoot, "target", "debug", "lifecycle-tui");
const pidFilePath = path.join(os.tmpdir(), "lifecycle-tui-dev.pid");
const watchTargets = [
  path.join(tuiRoot, "src"),
  path.join(tuiRoot, "Cargo.toml"),
  path.join(projectRoot, "Cargo.lock"),
];
const bridgeWatchTargets = [
  path.join(projectRoot, "packages", "bridge", "src"),
  path.join(projectRoot, "packages", "bridge", "routes"),
  path.join(projectRoot, "packages", "bridge", "routed.gen.ts"),
  path.join(projectRoot, "packages", "cli", "src", "commands", "bridge"),
  path.join(projectRoot, "packages", "cli", "src", "stack-registry.ts"),
  path.join(projectRoot, "packages", "cli", "src", "workspace-registry.ts"),
  path.join(projectRoot, "packages", "workspace", "src"),
  path.join(projectRoot, "packages", "stack", "src"),
  path.join(projectRoot, "packages", "db", "src"),
];

let bridgeUrl = "";
let env = { ...process.env };
let bridgeRestartNeeded = false;

let appChild: ChildProcess | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let restarting = false;
let restartQueued = false;
let shuttingDown = false;

function restoreTerminal() {
  process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l");
  process.stdout.write("\x1b[?25h\x1b[?1049l");
  spawnSync("stty", ["sane"], { stdio: "ignore" });
}

async function writePidFile(pid: number) {
  await mkdir(path.dirname(pidFilePath), { recursive: true });
  await writeFile(pidFilePath, `${pid}\n`, "utf8");
}

async function removePidFile() {
  await rm(pidFilePath, { force: true });
}

async function reapStaleManagedTui() {
  let text: string;
  try {
    text = await readFile(pidFilePath, "utf8");
  } catch {
    return;
  }

  const pid = Number.parseInt(text.trim(), 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    await removePidFile();
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    await removePidFile();
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    process.kill(pid, 0);
    process.kill(pid, "SIGKILL");
  } catch {
    // already gone
  }

  await removePidFile();
}

async function stopApp() {
  const child = appChild;
  if (!child) {
    await removePidFile();
    return;
  }

  appChild = null;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    child.once("exit", finish);
    if (child.pid) {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    } else {
      child.kill("SIGTERM");
    }

    setTimeout(() => {
      if (!settled) {
        if (child.pid) {
          try {
            process.kill(child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        } else {
          child.kill("SIGKILL");
        }
      }
    }, 1000);

    setTimeout(finish, 1500);
  });
  await removePidFile();
}

async function stopBridge() {
  const registration = await readBridgeRegistration();
  if (!registration) {
    return;
  }

  try {
    process.kill(registration.pid, "SIGTERM");
  } catch {
    return;
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      process.kill(registration.pid, 0);
    } catch {
      return;
    }
  }

  try {
    process.kill(registration.pid, "SIGKILL");
  } catch {
    // already gone
  }
}

async function ensureBridgeRuntime() {
  const { port } = await ensureBridge();
  bridgeUrl = `http://127.0.0.1:${port}`;
  env = {
    ...process.env,
    LIFECYCLE_BRIDGE_URL: bridgeUrl,
    LIFECYCLE_BRIDGE_CLI_RUNTIME: process.execPath,
    LIFECYCLE_BRIDGE_CLI_ENTRYPOINT: cliEntrypoint,
  };
  console.log(`Bridge running on ${bridgeUrl}`);
}

function buildTui(): boolean {
  restoreTerminal();
  const result = spawnSync("cargo", ["build", "-p", "lifecycle-tui"], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });
  return (result.status ?? 1) === 0;
}

async function startApp() {
  restoreTerminal();
  const child = spawn(binaryPath, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });

  if (!child.pid) {
    throw new Error("Failed to start lifecycle-tui.");
  }

  child.on("exit", () => {
    if (appChild?.pid === child.pid) {
      appChild = null;
      restoreTerminal();
    }
    void removePidFile();
  });

  appChild = child;
  await writePidFile(child.pid);
}

async function restartApp() {
  if (restarting) {
    restartQueued = true;
    return;
  }

  restarting = true;
  try {
    await stopApp();
    if (bridgeRestartNeeded) {
      await stopBridge();
      await ensureBridgeRuntime();
      bridgeRestartNeeded = false;
    }
    if (buildTui()) {
      await startApp();
    }
  } finally {
    restarting = false;
    if (restartQueued && !shuttingDown) {
      restartQueued = false;
      void restartApp();
    }
  }
}

function scheduleRestart(options: { restartBridge?: boolean } = {}) {
  if (shuttingDown) {
    return;
  }

  if (options.restartBridge) {
    bridgeRestartNeeded = true;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    void restartApp();
  }, 80);
}

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  void (async () => {
    await stopApp();
    restoreTerminal();
    process.exit(signal === "SIGINT" ? 130 : 143);
  })();
}

for (const target of watchTargets) {
  const recursive = target.endsWith(path.sep + "src");
  watch(target, { recursive }, () => {
    scheduleRestart();
  });
}

for (const target of bridgeWatchTargets) {
  const recursive = !target.endsWith(".ts");
  watch(target, { recursive }, () => {
    scheduleRestart({ restartBridge: true });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", restoreTerminal);

await reapStaleManagedTui();
await stopBridge();
await ensureBridgeRuntime();

if (buildTui()) {
  await startApp();
}
