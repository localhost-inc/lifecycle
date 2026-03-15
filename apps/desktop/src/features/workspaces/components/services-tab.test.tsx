import type { ServiceRecord } from "@lifecycle/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { resolvePreviewUrl, ServiceRow } from "./services-tab";

const failedService: ServiceRecord = {
  created_at: "2026-03-12T10:00:00.000Z",
  default_port: 5432,
  effective_port: 44446,
  exposure: "internal",
  id: "svc-postgres",
  port_override: null,
  preview_failure_reason: null,
  preview_status: "disabled",
  preview_url: null,
  service_name: "postgres",
  status: "failed",
  status_reason: "service_start_failed",
  updated_at: "2026-03-12T10:00:00.000Z",
  workspace_id: "ws-1",
};

describe("ServiceRow", () => {
  test("prefers the current local effective port over a stale preview URL", () => {
    expect(
      resolvePreviewUrl({
        ...failedService,
        effective_port: 3002,
        exposure: "local",
        preview_url: "http://localhost:3001",
      }),
    ).toBe("http://localhost:3002");
  });

  test("renders a friendly failed-service status reason", () => {
    const markup = renderToStaticMarkup(
      createElement(ServiceRow, {
        onUpdateService: async () => {},
        runtime: "image",
        service: failedService,
      }),
    );

    expect(markup).toContain("Failed to start");
    expect(markup).not.toContain("service_start_failed");
  });

  test("renders the service name and port", () => {
    const markup = renderToStaticMarkup(
      createElement(ServiceRow, {
        onUpdateService: async () => {},
        runtime: "image",
        service: failedService,
      }),
    );

    expect(markup).toContain("postgres");
    expect(markup).toContain(":44446");
  });

  test("can switch the row into boot-log launch mode", () => {
    const markup = renderToStaticMarkup(
      createElement(ServiceRow, {
        onOpenLogs: () => {},
        onUpdateService: async () => {},
        runtime: "image",
        service: failedService,
      }),
    );

    expect(markup).toContain('aria-label="Show boot logs for postgres"');
    expect(markup).not.toContain("Exposure");
  });

  test("renders a compact play button for independently bootable services", () => {
    const markup = renderToStaticMarkup(
      createElement(ServiceRow, {
        onOpenLogs: () => {},
        onStartService: () => {},
        onUpdateService: async () => {},
        runtime: "image",
        service: failedService,
      }),
    );

    expect(markup).toContain('aria-label="Run postgres and its dependencies"');
    expect(markup).not.toContain(">Run<");
  });
});
