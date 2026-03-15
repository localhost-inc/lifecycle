import { type LifecycleConfig, type ServiceRecord } from "@lifecycle/contracts";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LogsTab, deriveBootLogEntries } from "./logs-tab";
import { deriveBootSequenceItems } from "./boot-sequence";
import type { EnvironmentTaskState, SetupStepState } from "../hooks";

const config: LifecycleConfig = {
  workspace: {
    setup: [{ command: "bun install", name: "install", timeout_seconds: 300 }],
    teardown: [],
  },
  environment: {
    db: {
      kind: "service",
      runtime: "image",
      image: "postgres:16",
    },
    "api-migrate": {
      kind: "task",
      command: "bun run db:migrate",
      depends_on: ["db"],
      timeout_seconds: 60,
    },
    api: {
      kind: "service",
      runtime: "process",
      command: "bun run dev",
      depends_on: ["api-migrate"],
      port: 8787,
    },
    "www-build": {
      kind: "task",
      command: "bun run content:seed",
      timeout_seconds: 60,
    },
    www: {
      kind: "service",
      runtime: "process",
      command: "bun run dev",
      depends_on: ["www-build"],
      port: 3000,
      share_default: true,
    },
  },
};

const setupSteps: SetupStepState[] = [
  {
    name: "install",
    output: ["bun install --frozen-lockfile"],
    status: "completed",
  },
];

const environmentTasks: EnvironmentTaskState[] = [
  {
    name: "api-migrate",
    output: ["bun run db:migrate"],
    status: "completed",
  },
  {
    name: "www-build",
    output: ["bun run content:seed"],
    status: "completed",
  },
];

function createService(serviceName: string, overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    created_at: "2026-03-15T10:00:00.000Z",
    default_port: null,
    effective_port: null,
    exposure: "internal",
    id: `svc-${serviceName}`,
    port_override: null,
    preview_failure_reason: null,
    preview_status: "disabled",
    preview_url: null,
    service_name: serviceName,
    status: "ready",
    status_reason: null,
    updated_at: "2026-03-15T10:00:00.000Z",
    workspace_id: "workspace_1",
    ...overrides,
  };
}

const services: ServiceRecord[] = [
  createService("db"),
  createService("api", {
    default_port: 8787,
    effective_port: 43001,
    exposure: "local",
    preview_status: "ready",
    preview_url: "http://127.0.0.1:8787",
  }),
  createService("www", {
    default_port: 3000,
    effective_port: 43002,
    exposure: "local",
    preview_status: "ready",
    preview_url: "http://127.0.0.1:3000",
  }),
];

const serviceRuntimeByName = {
  api: "process" as const,
  db: "image" as const,
  www: "process" as const,
};

describe("deriveBootLogEntries", () => {
  test("filters task output to the selected service dependency chain", () => {
    const items = deriveBootSequenceItems(
      config,
      [],
      setupSteps,
      environmentTasks,
      services,
      serviceRuntimeByName,
    );

    expect(deriveBootLogEntries(config, items, "api").map((entry) => entry.name)).toEqual([
      "install",
      "api-migrate",
    ]);
  });
});

describe("LogsTab", () => {
  test("renders the selected service boot logs without unrelated task output", () => {
    const markup = renderToStaticMarkup(
      createElement(LogsTab, {
        config,
        declaredStepNames: [],
        environmentTasks,
        onClearSelectedService: () => {},
        selectedServiceName: "api",
        serviceRuntimeByName,
        services,
        setupSteps,
        workspace: {
          failure_reason: null,
          setup_completed_at: null,
          status: "active",
        },
      }),
    );

    expect(markup).toContain("Service boot logs");
    expect(markup).toContain(">api<");
    expect(markup).toContain("bun install --frozen-lockfile");
    expect(markup).toContain("bun run db:migrate");
    expect(markup).not.toContain("bun run content:seed");
    expect(markup).toContain(">Show all<");
  });
});
