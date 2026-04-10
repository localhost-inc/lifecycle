import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  installProxyCleanHttp,
  proxyInstallStatus,
  readProxyInstallState,
  uninstallProxyCleanHttp,
} from "./install-proxy";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

describe("proxy install helpers", () => {
  test("reads install state from an overridden path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-proxy-install-"));
    tempDirs.push(dir);

    const statePath = join(dir, "install.json");
    await writeFile(
      statePath,
      JSON.stringify({
        cleanHttp: true,
        installedAt: "2026-04-10T00:00:00.000Z",
        platform: "darwin",
        proxyPort: 52300,
      }),
      "utf8",
    );

    const environment = { LIFECYCLE_PROXY_INSTALL_STATE_PATH: statePath };
    expect(await readProxyInstallState(environment, "darwin")).toEqual({
      cleanHttp: true,
      installedAt: "2026-04-10T00:00:00.000Z",
      platform: "darwin",
      proxyPort: 52300,
    });
    expect(await proxyInstallStatus({ environment, platform: "darwin" })).toMatchObject({
      currentPlatformSupported: true,
      installed: true,
      platform: "darwin",
      proxyPort: 52300,
    });
  });

  test("renders darwin install actions in dry-run mode without mutating files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-proxy-install-darwin-"));
    tempDirs.push(dir);

    const pfConfPath = join(dir, "pf.conf");
    const anchorPath = join(dir, "anchor.conf");
    const launchDaemonPath = join(dir, "launchd.plist");
    const statePath = join(dir, "install.json");

    await writeFile(pfConfPath, "scrub-anchor \"com.apple/*\"\n", "utf8");

    const environment = {
      LIFECYCLE_PREVIEW_PROXY_PORT: "52444",
      LIFECYCLE_PROXY_DARWIN_ANCHOR_PATH: anchorPath,
      LIFECYCLE_PROXY_DARWIN_LAUNCH_DAEMON_PATH: launchDaemonPath,
      LIFECYCLE_PROXY_DARWIN_PF_CONF: pfConfPath,
      LIFECYCLE_PROXY_INSTALL_STATE_PATH: statePath,
    };

    const actions = await installProxyCleanHttp({
      dryRun: true,
      environment,
      platform: "darwin",
    });

    expect(actions).toEqual([
      `update ${pfConfPath}`,
      `write ${anchorPath}`,
      `write ${launchDaemonPath}`,
    ]);
    expect(await readFile(pfConfPath, "utf8")).toBe('scrub-anchor "com.apple/*"\n');
    expect(await readProxyInstallState(environment, "darwin")).toBeNull();
  });

  test("renders linux uninstall actions in dry-run mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-proxy-install-linux-"));
    tempDirs.push(dir);

    const servicePath = join(dir, "lifecycle-http-redirect.service");
    const environment = {
      LIFECYCLE_PROXY_INSTALL_STATE_PATH: join(dir, "install.json"),
      LIFECYCLE_PROXY_LINUX_SERVICE_PATH: servicePath,
    };

    expect(
      await uninstallProxyCleanHttp({
        dryRun: true,
        environment,
        platform: "linux",
      }),
    ).toEqual([`remove ${servicePath}`]);
  });
});
