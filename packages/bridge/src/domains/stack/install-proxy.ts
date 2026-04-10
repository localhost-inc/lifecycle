import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePreviewProxyPort } from "../stack";

type SupportedPlatform = "darwin" | "linux";

export interface ProxyInstallState {
  cleanHttp: true;
  installedAt: string;
  platform: SupportedPlatform;
  proxyPort: number;
}

export interface ProxyInstallStatus {
  currentPlatformSupported: boolean;
  installed: boolean;
  platform: NodeJS.Platform;
  proxyPort: number;
  state: ProxyInstallState | null;
}

interface InstallOptions {
  dryRun?: boolean;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isSupportedPlatform(platform: NodeJS.Platform): platform is SupportedPlatform {
  return platform === "darwin" || platform === "linux";
}

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

function execOrThrow(command: string, options?: InstallOptions): void {
  if (options?.dryRun) {
    return;
  }

  const result = spawnSync("/bin/sh", ["-lc", command], {
    env: options?.environment ?? process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command}`);
  }
}

function installStatePath(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const explicit = environment.LIFECYCLE_PROXY_INSTALL_STATE_PATH?.trim();
  if (explicit) {
    return explicit;
  }

  if (platform === "darwin") {
    return "/Library/Application Support/Lifecycle/install.json";
  }

  return "/etc/lifecycle/install.json";
}

async function writeInstallState(
  state: ProxyInstallState,
  options?: InstallOptions,
): Promise<void> {
  if (options?.dryRun) {
    return;
  }

  const path = installStatePath(options?.environment, options?.platform);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}

async function removeInstallState(options?: InstallOptions): Promise<void> {
  if (options?.dryRun) {
    return;
  }

  await rm(installStatePath(options?.environment, options?.platform), { force: true });
}

export async function readProxyInstallState(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<ProxyInstallState | null> {
  try {
    const raw = await readFile(installStatePath(environment, platform), "utf8");
    const parsed = JSON.parse(raw) as Partial<ProxyInstallState>;
    if (
      parsed.cleanHttp !== true ||
      !parsed.installedAt ||
      !parsed.platform ||
      !isSupportedPlatform(parsed.platform) ||
      typeof parsed.proxyPort !== "number"
    ) {
      return null;
    }

    return {
      cleanHttp: true,
      installedAt: parsed.installedAt,
      platform: parsed.platform,
      proxyPort: parsed.proxyPort,
    };
  } catch {
    return null;
  }
}

export async function proxyInstallStatus(
  options?: Pick<InstallOptions, "environment" | "platform">,
): Promise<ProxyInstallStatus> {
  const platform = options?.platform ?? process.platform;
  const environment = options?.environment ?? process.env;
  const state = await readProxyInstallState(environment, platform);
  return {
    currentPlatformSupported: isSupportedPlatform(platform),
    installed: state !== null,
    platform,
    proxyPort: resolvePreviewProxyPort(environment),
    state,
  };
}

function darwinAnchorName(): string {
  return "com.lifecycle.http-redirect";
}

function darwinPfConfPath(environment: NodeJS.ProcessEnv): string {
  return environment.LIFECYCLE_PROXY_DARWIN_PF_CONF?.trim() || "/etc/pf.conf";
}

function darwinAnchorPath(environment: NodeJS.ProcessEnv): string {
  return (
    environment.LIFECYCLE_PROXY_DARWIN_ANCHOR_PATH?.trim() ||
    `/etc/pf.anchors/${darwinAnchorName()}`
  );
}

function darwinLaunchDaemonPath(environment: NodeJS.ProcessEnv): string {
  return (
    environment.LIFECYCLE_PROXY_DARWIN_LAUNCH_DAEMON_PATH?.trim() ||
    "/Library/LaunchDaemons/com.lifecycle.http-redirect.plist"
  );
}

function darwinPfBlock(): string {
  const anchor = darwinAnchorName();
  return [
    "# >>> lifecycle http redirect >>>",
    `rdr-anchor "${anchor}"`,
    `anchor "${anchor}"`,
    "# <<< lifecycle http redirect <<<",
  ].join("\n");
}

function darwinAnchorContents(proxyPort: number): string {
  return `rdr pass on lo0 inet proto tcp from any to 127.0.0.1 port 80 -> 127.0.0.1 port ${proxyPort}\n`;
}

async function installDarwin(options?: InstallOptions): Promise<string[]> {
  const environment = options?.environment ?? process.env;
  const proxyPort = resolvePreviewProxyPort(environment);
  const pfConfPath = darwinPfConfPath(environment);
  const anchorPath = darwinAnchorPath(environment);
  const launchDaemonPath = darwinLaunchDaemonPath(environment);
  const pfBlock = darwinPfBlock();
  const commands: string[] = [];

  const existingPfConf = await readFile(pfConfPath, "utf8");
  if (!existingPfConf.includes("# >>> lifecycle http redirect >>>")) {
    const nextPfConf = `${existingPfConf.trimEnd()}\n\n${pfBlock}\n`;
    if (!options?.dryRun) {
      await writeFile(pfConfPath, nextPfConf, "utf8");
    }
    commands.push(`update ${pfConfPath}`);
  }

  if (!options?.dryRun) {
    await writeFile(anchorPath, darwinAnchorContents(proxyPort), "utf8");
  }
  commands.push(`write ${anchorPath}`);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lifecycle.http-redirect</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-lc</string>
    <string>/sbin/pfctl -f ${pfConfPath.replace(/&/g, "&amp;")} &amp;&amp; /sbin/pfctl -e</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;

  if (!options?.dryRun) {
    await writeFile(launchDaemonPath, plist, "utf8");
  }
  commands.push(`write ${launchDaemonPath}`);

  execOrThrow(
    `/bin/launchctl bootout system ${shellQuote(launchDaemonPath)} >/dev/null 2>&1 || true`,
    options,
  );
  execOrThrow(`/bin/launchctl bootstrap system ${shellQuote(launchDaemonPath)}`, options);
  execOrThrow("/bin/launchctl kickstart -k system/com.lifecycle.http-redirect", options);
  execOrThrow(`/sbin/pfctl -f ${shellQuote(pfConfPath)}`, options);
  execOrThrow("/sbin/pfctl -e >/dev/null 2>&1 || true", options);

  await writeInstallState(
    {
      cleanHttp: true,
      installedAt: nowIso(),
      platform: "darwin",
      proxyPort,
    },
    { ...options, environment, platform: "darwin" },
  );

  return commands;
}

async function uninstallDarwin(options?: InstallOptions): Promise<string[]> {
  const environment = options?.environment ?? process.env;
  const pfConfPath = darwinPfConfPath(environment);
  const anchorPath = darwinAnchorPath(environment);
  const launchDaemonPath = darwinLaunchDaemonPath(environment);
  const commands: string[] = [];

  try {
    const existingPfConf = await readFile(pfConfPath, "utf8");
    const nextPfConf = existingPfConf.replace(
      /\n?# >>> lifecycle http redirect >>>[\s\S]*?# <<< lifecycle http redirect <<<\n?/,
      "\n",
    );
    if (nextPfConf !== existingPfConf) {
      if (!options?.dryRun) {
        await writeFile(pfConfPath, `${nextPfConf.trimEnd()}\n`, "utf8");
      }
      commands.push(`update ${pfConfPath}`);
    }
  } catch {
    // ignore missing pf.conf
  }

  execOrThrow(
    `/bin/launchctl bootout system ${shellQuote(launchDaemonPath)} >/dev/null 2>&1 || true`,
    options,
  );
  if (!options?.dryRun) {
    await rm(launchDaemonPath, { force: true });
    await rm(anchorPath, { force: true });
  }
  commands.push(`remove ${launchDaemonPath}`);
  commands.push(`remove ${anchorPath}`);
  execOrThrow(`/sbin/pfctl -f ${shellQuote(pfConfPath)} >/dev/null 2>&1 || true`, options);
  await removeInstallState({ ...options, environment, platform: "darwin" });
  return commands;
}

function linuxServicePath(environment: NodeJS.ProcessEnv): string {
  return (
    environment.LIFECYCLE_PROXY_LINUX_SERVICE_PATH?.trim() ||
    "/etc/systemd/system/lifecycle-http-redirect.service"
  );
}

function linuxServiceContents(proxyPort: number): string {
  const rule = `iptables -t nat -C OUTPUT -d 127.0.0.1/32 -p tcp --dport 80 -j REDIRECT --to-ports ${proxyPort} || iptables -t nat -A OUTPUT -d 127.0.0.1/32 -p tcp --dport 80 -j REDIRECT --to-ports ${proxyPort}`;
  const stopRule = `iptables -t nat -D OUTPUT -d 127.0.0.1/32 -p tcp --dport 80 -j REDIRECT --to-ports ${proxyPort} || true`;

  return `[Unit]
Description=Lifecycle local HTTP redirect
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -lc '${rule}'
ExecStop=/bin/sh -lc '${stopRule}'

[Install]
WantedBy=multi-user.target
`;
}

async function installLinux(options?: InstallOptions): Promise<string[]> {
  const environment = options?.environment ?? process.env;
  const proxyPort = resolvePreviewProxyPort(environment);
  const servicePath = linuxServicePath(environment);
  const commands = [`write ${servicePath}`];

  if (!options?.dryRun) {
    await writeFile(servicePath, linuxServiceContents(proxyPort), "utf8");
  }

  execOrThrow("systemctl daemon-reload", options);
  execOrThrow("systemctl enable --now lifecycle-http-redirect.service", options);

  await writeInstallState(
    {
      cleanHttp: true,
      installedAt: nowIso(),
      platform: "linux",
      proxyPort,
    },
    { ...options, environment, platform: "linux" },
  );

  return commands;
}

async function uninstallLinux(options?: InstallOptions): Promise<string[]> {
  const environment = options?.environment ?? process.env;
  const servicePath = linuxServicePath(environment);
  execOrThrow("systemctl disable --now lifecycle-http-redirect.service >/dev/null 2>&1 || true", options);
  execOrThrow("systemctl daemon-reload", options);

  if (!options?.dryRun) {
    await rm(servicePath, { force: true });
  }

  await removeInstallState({ ...options, environment, platform: "linux" });
  return [`remove ${servicePath}`];
}

function requireSupportedPlatform(platform: NodeJS.Platform): SupportedPlatform {
  if (!isSupportedPlatform(platform)) {
    throw new Error(
      `lifecycle proxy install is currently supported on macOS and Linux only. Detected: ${platform}`,
    );
  }

  return platform;
}

export async function installProxyCleanHttp(options?: InstallOptions): Promise<string[]> {
  const platform = requireSupportedPlatform(options?.platform ?? process.platform);
  if (platform === "darwin") {
    return installDarwin({ ...options, platform });
  }

  return installLinux({ ...options, platform });
}

export async function uninstallProxyCleanHttp(options?: InstallOptions): Promise<string[]> {
  const platform = requireSupportedPlatform(options?.platform ?? process.platform);
  if (platform === "darwin") {
    return uninstallDarwin({ ...options, platform });
  }

  return uninstallLinux({ ...options, platform });
}
