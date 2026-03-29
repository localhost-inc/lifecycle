import { describe, expect, mock, test } from "bun:test";
import { LocalEnvironmentClient } from "./client";
import type { LifecycleConfig } from "@lifecycle/contracts";

describe("LocalEnvironmentClient", () => {
  test("starts a targeted process service with explicit runtime inputs", async () => {
    const invoke = mock(async (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
      switch (cmd) {
        case "assign_ports":
          return { assignedPorts: { web: 43123 } };
        case "resolve_lifecycle_root_path":
          return "/tmp/lifecycle";
        case "get_preview_proxy_port":
          return 52300;
        default:
          return args ?? null;
      }
    });
    const client = new LocalEnvironmentClient({ invoke });
    const config = {
      workspace: { prepare: [] },
      environment: {
        web: {
          kind: "service",
          runtime: "process",
          command: "bun run web",
          env: {
            ORIGIN: "${LIFECYCLE_SERVICE_WEB_URL}",
          },
        },
      },
    } satisfies LifecycleConfig;

    const result = await client.start(config, {
      environmentId: "workspace_1",
      hostLabel: "frost-beacon",
      name: "Frost Beacon",
      prepared: false,
      readyServiceNames: [],
      rootPath: "/tmp/frost-beacon",
      serviceNames: ["web"],
      services: [
        {
          id: "service_web",
          workspace_id: "workspace_1",
          name: "web",
          status: "stopped",
          status_reason: null,
          assigned_port: null,
          preview_url: null,
          created_at: "2026-03-10T10:00:00.000Z",
          updated_at: "2026-03-10T10:00:00.000Z",
        },
      ],
      sourceRef: "lifecycle/frost-beacon",
    });

    expect(result.preparedAt).toBeNull();
    expect(result.startedServices).toEqual([{ assignedPort: 43123, name: "web" }]);
    expect(invoke).toHaveBeenCalledWith("assign_ports", {
      request: {
        seedId: "workspace_1",
        names: ["web"],
        currentPorts: [{ assignedPort: null, name: "web", status: "stopped" }],
      },
    });
    expect(invoke).toHaveBeenCalledWith("resolve_lifecycle_root_path");
    expect(invoke).toHaveBeenCalledWith("get_preview_proxy_port");
    expect(invoke).toHaveBeenCalledWith("spawn_managed_process", {
      request: {
        id: "workspace_1:web",
        binary: "sh",
        args: ["-c", "bun run web"],
        cwd: "/tmp/frost-beacon",
        env: expect.objectContaining({
          LIFECYCLE_SERVICE_WEB_PORT: "43123",
          LIFECYCLE_SERVICE_WEB_URL: "http://web.frost-beacon.lifecycle.localhost:52300",
          ORIGIN: "http://web.frost-beacon.lifecycle.localhost:52300",
        }),
        logDir: "/tmp/lifecycle/logs/environments/workspace_1",
      },
    });
  });

  test("stops tracked processes and containers for each named service", async () => {
    const invoke = mock(async (cmd: string, args?: Record<string, unknown>) => args ?? cmd);
    const client = new LocalEnvironmentClient({ invoke });

    await client.stop("workspace_1", ["web", "api"]);

    expect(invoke).toHaveBeenCalledWith("kill_managed_process", { id: "workspace_1:web" });
    expect(invoke).toHaveBeenCalledWith("stop_managed_container", { id: "workspace_1:web" });
    expect(invoke).toHaveBeenCalledWith("kill_managed_process", { id: "workspace_1:api" });
    expect(invoke).toHaveBeenCalledWith("stop_managed_container", { id: "workspace_1:api" });
  });
});
