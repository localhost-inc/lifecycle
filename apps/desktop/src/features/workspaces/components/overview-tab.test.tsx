import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveSetupPresentation, OverviewTab } from "./overview-tab";
import type { SetupStepState } from "../hooks";

const runningSteps: SetupStepState[] = [
  {
    name: "install",
    output: ["bun install --frozen-lockfile"],
    status: "completed",
  },
  {
    name: "write-local-env",
    output: ["Wrote .env.local"],
    status: "running",
  },
];

const defaultProps = {
  config: null,
  declaredStepNames: [],
  environmentTasks: [],
  onUpdateService: async () => {},
  serviceRuntimeByName: {},
  services: [],
};

describe("OverviewTab", () => {
  test("always renders setup, tasks, and services sections", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewTab, {
        ...defaultProps,
        setupSteps: [],
        workspace: { failure_reason: null, status: "idle" },
      }),
    );

    expect(markup).toContain("Setup");
    expect(markup).toContain("Tasks");
    expect(markup).toContain("Services");
  });

  test("renders step list during running state without summary card", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewTab, {
        ...defaultProps,
        setupSteps: runningSteps,
        workspace: { failure_reason: null, status: "starting" },
      }),
    );

    expect(markup).toContain("install");
    expect(markup).toContain("write-local-env");
    expect(markup).not.toContain("Current step");
    expect(markup).not.toContain("Step 2 of 2");
  });

  test("shows failed banner when setup failed", () => {
    const failedSteps: SetupStepState[] = [
      { name: "install", output: ["error"], status: "failed" },
    ];

    const markup = renderToStaticMarkup(
      createElement(OverviewTab, {
        ...defaultProps,
        setupSteps: failedSteps,
        workspace: { failure_reason: "setup_step_failed", status: "idle" },
      }),
    );

    expect(markup).toContain("Setup failed");
    expect(markup).toContain("install");
  });

  test("shows completed banner when all steps done", () => {
    const completedSteps: SetupStepState[] = [
      { name: "install", output: ["done"], status: "completed" },
      { name: "write-local-env", output: ["done"], status: "completed" },
    ];

    const markup = renderToStaticMarkup(
      createElement(OverviewTab, {
        ...defaultProps,
        setupSteps: completedSteps,
        workspace: { failure_reason: null, status: "active" },
      }),
    );

    expect(markup).toContain("Setup complete");
  });

  test("falls back to declared steps when no activity was captured yet", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewTab, {
        ...defaultProps,
        declaredStepNames: ["install", "write-local-env"],
        setupSteps: [],
        workspace: { failure_reason: null, status: "idle" },
      }),
    );

    expect(markup).toContain("install");
    expect(markup).toContain("write-local-env");
  });

  test("renders services as a flat list without sub-grouping", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewTab, {
        ...defaultProps,
        setupSteps: [],
        serviceRuntimeByName: { postgres: "image", api: "process" },
        services: [
          {
            created_at: "2026-03-12T10:00:00.000Z",
            default_port: 5432,
            effective_port: 44446,
            exposure: "internal" as const,
            id: "svc-postgres",
            port_override: null,
            preview_failure_reason: null,
            preview_status: "disabled" as const,
            preview_url: null,
            service_name: "postgres",
            status: "ready" as const,
            status_reason: null,
            updated_at: "2026-03-12T10:00:00.000Z",
            workspace_id: "ws-1",
          },
          {
            created_at: "2026-03-12T10:00:00.000Z",
            default_port: 3001,
            effective_port: 3001,
            exposure: "local" as const,
            id: "svc-api",
            port_override: null,
            preview_failure_reason: null,
            preview_status: "disabled" as const,
            preview_url: null,
            service_name: "api",
            status: "ready" as const,
            status_reason: null,
            updated_at: "2026-03-12T10:00:01.000Z",
            workspace_id: "ws-1",
          },
        ],
        workspace: { failure_reason: null, status: "active" },
      }),
    );

    expect(markup).toContain("postgres");
    expect(markup).toContain("api");
    expect(markup).not.toContain("Image services");
    expect(markup).not.toContain("Process services");
  });
});

describe("deriveSetupPresentation", () => {
  test("resolves failed setup when the workspace stops on setup_step_failed", () => {
    const presentation = deriveSetupPresentation(
      [{ name: "install", output: ["bun install"], status: "failed" }],
      { failure_reason: "setup_step_failed", status: "idle" },
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.phase).toBe("failed");
    expect(presentation?.currentStepName).toBe("install");
    expect(presentation?.completedSteps).toBe(0);
  });

  test("resolves running state", () => {
    const presentation = deriveSetupPresentation(runningSteps, {
      failure_reason: null,
      status: "starting",
    });

    expect(presentation).not.toBeNull();
    expect(presentation?.phase).toBe("running");
    expect(presentation?.currentStepName).toBe("write-local-env");
    expect(presentation?.completedSteps).toBe(1);
  });

  test("resolves completed state", () => {
    const presentation = deriveSetupPresentation(
      [
        { name: "install", output: [], status: "completed" },
        { name: "write-local-env", output: [], status: "completed" },
      ],
      { failure_reason: null, status: "active" },
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.phase).toBe("completed");
    expect(presentation?.completedSteps).toBe(2);
  });

  test("returns null for empty steps", () => {
    expect(deriveSetupPresentation([], { failure_reason: null, status: "idle" })).toBeNull();
  });
});
