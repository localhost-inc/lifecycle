import { type LifecycleConfig, type ServiceRecord } from "@lifecycle/contracts";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveBootPresentation, deriveBootSequenceItems, BootSequence } from "./boot-sequence";
import type { EnvironmentTaskState, SetupStepState } from "../hooks";

const graphConfig: LifecycleConfig = {
  workspace: {
    setup: [
      { command: "bun install", name: "install", timeout_seconds: 60 },
      { command: "bun run write-local-env", name: "write-local-env", timeout_seconds: 60 },
    ],
    teardown: [],
  },
  environment: {
    redis: {
      kind: "service",
      runtime: "image",
      image: "redis:7",
    },
    postgres: {
      kind: "service",
      runtime: "image",
      image: "postgres:16",
      port: 5432,
    },
    migrate: {
      kind: "task",
      command: "bun run db:migrate",
      depends_on: ["postgres"],
      timeout_seconds: 60,
    },
    api: {
      kind: "service",
      runtime: "process",
      command: "bun run api",
      depends_on: ["migrate", "redis"],
      port: 3001,
    },
  },
};

const setupSteps: SetupStepState[] = [
  {
    name: "install",
    output: ["bun install --frozen-lockfile"],
    status: "completed",
  },
  {
    name: "write-local-env",
    output: ["wrote .env.local"],
    status: "completed",
  },
];

const environmentTasks: EnvironmentTaskState[] = [
  {
    name: "migrate",
    output: ["bun run db:migrate"],
    status: "running",
  },
];

function createServiceRecord(
  serviceName: string,
  overrides: Partial<ServiceRecord> = {},
): ServiceRecord {
  return {
    created_at: "2026-03-14T10:00:00.000Z",
    default_port: null,
    effective_port: null,
    exposure: "internal",
    id: `svc-${serviceName}`,
    port_override: null,
    preview_failure_reason: null,
    preview_status: "disabled",
    preview_url: null,
    service_name: serviceName,
    status: "stopped",
    status_reason: null,
    updated_at: "2026-03-14T10:00:00.000Z",
    workspace_id: "workspace_1",
    ...overrides,
  };
}

const defaultProps = {
  config: graphConfig,
  declaredStepNames: [],
  environmentTasks: [],
  onUpdateService: async () => {},
  serviceRuntimeByName: {
    api: "process" as const,
    postgres: "image" as const,
    redis: "image" as const,
  },
  services: [],
};

describe("BootSequence", () => {
  test("renders environment nodes without separate setup, task, and service sections", () => {
    const markup = renderToStaticMarkup(
      createElement(BootSequence, {
        ...defaultProps,
        setupSteps: [],
        workspace: { failure_reason: null, status: "idle" },
      }),
    );

    expect(markup).not.toContain(">Tasks<");
    expect(markup).not.toContain(">Services<");
  });

  test("renders the boot sequence in graph execution order while starting", () => {
    const markup = renderToStaticMarkup(
      createElement(BootSequence, {
        ...defaultProps,
        environmentTasks,
        services: [
          createServiceRecord("postgres", {
            default_port: 5432,
            effective_port: 43085,
            status: "ready",
          }),
          createServiceRecord("redis", {
            effective_port: 47070,
            status: "ready",
          }),
          createServiceRecord("api", {
            default_port: 3001,
            effective_port: 3001,
            exposure: "local",
            preview_status: "provisioning",
            preview_url: "http://localhost:3001",
            status: "starting",
          }),
        ],
        setupSteps,
        workspace: { failure_reason: null, status: "starting" },
      }),
    );

    expect(markup).not.toContain("Booting environment");
    expect(markup).toContain("install");
    expect(markup).toContain("write-local-env");
    expect(markup).toContain("postgres");
    expect(markup).toContain("redis");
    expect(markup).toContain("migrate");
    expect(markup).toContain("api");
    expect(markup.indexOf("install")).toBeLessThan(markup.indexOf("write-local-env"));
    expect(markup.indexOf("write-local-env")).toBeLessThan(markup.indexOf("postgres"));
    expect(markup.indexOf("postgres")).toBeLessThan(markup.indexOf("migrate"));
    expect(markup.indexOf("migrate")).toBeLessThan(markup.indexOf("redis"));
    expect(markup.indexOf("migrate")).toBeLessThan(markup.indexOf("api"));
  });

  test("shows the loader on the active step while the boot sequence is running", () => {
    const markup = renderToStaticMarkup(
      createElement(BootSequence, {
        ...defaultProps,
        config: null,
        declaredStepNames: ["install", "write-local-env"],
        services: [],
        setupSteps: [],
        workspace: { failure_reason: null, status: "starting" },
      }),
    );

    expect(markup).not.toContain("Booting environment");
    expect(markup).toContain("install");
    expect(markup).toContain("lucide-loader-circle");
  });

  test("falls back to declared setup steps before any activity is captured", () => {
    const markup = renderToStaticMarkup(
      createElement(BootSequence, {
        ...defaultProps,
        config: null,
        declaredStepNames: ["install", "write-local-env"],
        setupSteps: [],
        workspace: { failure_reason: null, status: "idle" },
      }),
    );

    expect(markup).toContain("install");
    expect(markup).toContain("write-local-env");
  });

  test("shows a failed boot banner when startup stops on a failed step", () => {
    const markup = renderToStaticMarkup(
      createElement(BootSequence, {
        ...defaultProps,
        config: null,
        setupSteps: [{ name: "install", output: ["error"], status: "failed" }],
        workspace: { failure_reason: "setup_step_failed", status: "idle" },
      }),
    );

    expect(markup).not.toContain("Boot failed");
    expect(markup).toContain("install");
  });
});

describe("deriveBootSequenceItems", () => {
  test("orders environment roots alphabetically to match the runtime topological sort", () => {
    const items = deriveBootSequenceItems(
      graphConfig,
      [],
      setupSteps,
      environmentTasks,
      [
        createServiceRecord("postgres", { status: "ready" }),
        createServiceRecord("redis", { status: "ready" }),
        createServiceRecord("api", { status: "starting" }),
      ],
      defaultProps.serviceRuntimeByName,
    );

    expect(items.map((item) => item.id)).toEqual([
      "setup:install",
      "setup:write-local-env",
      "service:postgres",
      "task:migrate",
      "service:redis",
      "service:api",
    ]);
  });

  test("keeps declared graph services visible before service records exist", () => {
    const items = deriveBootSequenceItems(
      graphConfig,
      [],
      setupSteps,
      [],
      [],
      defaultProps.serviceRuntimeByName,
    );

    expect(items.map((item) => item.id)).toContain("service:postgres");
    expect(items.map((item) => item.id)).toContain("service:redis");
    expect(items.map((item) => item.id)).toContain("service:api");
  });

  test("omits create-scoped setup steps and tasks after setup has completed", () => {
    const restartConfig: LifecycleConfig = {
      workspace: {
        setup: [
          { command: "bun install", name: "install", timeout_seconds: 60 },
          {
            command: "bun run write-local-env",
            name: "write-local-env",
            run_on: "start",
            timeout_seconds: 60,
          },
        ],
        teardown: [],
      },
      environment: {
        postgres: {
          kind: "service",
          runtime: "image",
          image: "postgres:16",
        },
        migrate: {
          kind: "task",
          command: "bun run db:migrate",
          depends_on: ["postgres"],
          timeout_seconds: 60,
        },
        api: {
          kind: "service",
          runtime: "process",
          command: "bun run api",
          depends_on: ["migrate", "postgres"],
        },
      },
    };

    const items = deriveBootSequenceItems(
      restartConfig,
      [],
      [],
      [],
      [],
      { api: "process", postgres: "image" },
      true,
    );

    expect(items.map((item) => item.id)).toEqual([
      "setup:write-local-env",
      "service:postgres",
      "service:api",
    ]);
  });
});

describe("deriveBootPresentation", () => {
  test("resolves failed boot state", () => {
    const presentation = deriveBootPresentation(
      deriveBootSequenceItems(
        null,
        ["install"],
        [{ name: "install", output: ["bun install"], status: "failed" }],
        [],
        [],
        {},
      ),
      { failure_reason: "setup_step_failed", status: "idle" },
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.phase).toBe("failed");
    expect(presentation?.currentStepName).toBe("install");
    expect(presentation?.completedSteps).toBe(0);
  });

  test("resolves running boot state from the first running graph node", () => {
    const presentation = deriveBootPresentation(
      deriveBootSequenceItems(
        graphConfig,
        [],
        setupSteps,
        environmentTasks,
        [
          createServiceRecord("postgres", { status: "ready" }),
          createServiceRecord("redis", { status: "ready" }),
          createServiceRecord("api", { status: "starting" }),
        ],
        defaultProps.serviceRuntimeByName,
      ),
      { failure_reason: null, status: "starting" },
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.phase).toBe("running");
    expect(presentation?.currentStepName).toBe("migrate");
    expect(presentation?.completedSteps).toBe(4);
  });

  test("resolves completed boot state when the workspace is active", () => {
    const presentation = deriveBootPresentation(
      deriveBootSequenceItems(
        graphConfig,
        [],
        setupSteps,
        [{ name: "migrate", output: [], status: "completed" }],
        [
          createServiceRecord("postgres", { status: "ready" }),
          createServiceRecord("redis", { status: "ready" }),
          createServiceRecord("api", { status: "ready" }),
        ],
        defaultProps.serviceRuntimeByName,
      ),
      { failure_reason: null, status: "active" },
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.phase).toBe("completed");
    expect(presentation?.completedSteps).toBe(6);
  });

  test("returns null for an empty boot sequence", () => {
    expect(deriveBootPresentation([], { failure_reason: null, status: "idle" })).toBeNull();
  });
});
