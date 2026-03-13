import type { ServiceRecord } from "@lifecycle/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { ServicesTab } from "./services-tab";

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

describe("ServicesTab", () => {
  test("renders a friendly failed-service status reason", () => {
    const markup = renderToStaticMarkup(
      createElement(ServicesTab, {
        declaredTaskCount: 0,
        declaredServiceCount: 1,
        environmentTasks: [],
        manifestState: "valid",
        onUpdateService: async () => {},
        serviceRuntimeByName: { postgres: "image" },
        services: [failedService],
      }),
    );

    expect(markup).toContain("Failed to start");
    expect(markup).not.toContain("service_start_failed");
  });

  test("renders environment tasks above services in overview", () => {
    const markup = renderToStaticMarkup(
      createElement(ServicesTab, {
        declaredTaskCount: 1,
        declaredServiceCount: 1,
        environmentTasks: [
          {
            name: "migrate",
            output: ["bun run db:migrate"],
            status: "running",
          },
        ],
        manifestState: "valid",
        onUpdateService: async () => {},
        serviceRuntimeByName: { postgres: "image" },
        services: [failedService],
      }),
    );

    expect(markup).toContain("Environment tasks");
    expect(markup).toContain("Image services");
    expect(markup).toContain("migrate");
    expect(markup).toContain("postgres");
  });

  test("groups process and image services separately when runtime metadata is available", () => {
    const markup = renderToStaticMarkup(
      createElement(ServicesTab, {
        declaredTaskCount: 0,
        declaredServiceCount: 2,
        environmentTasks: [],
        manifestState: "valid",
        onUpdateService: async () => {},
        serviceRuntimeByName: {
          api: "process",
          postgres: "image",
        },
        services: [
          failedService,
          {
            ...failedService,
            id: "svc-api",
            service_name: "api",
            default_port: 3001,
            effective_port: 3001,
            status: "ready",
            status_reason: null,
            updated_at: "2026-03-12T10:00:01.000Z",
          },
        ],
      }),
    );

    expect(markup).toContain("Services");
    expect(markup).toContain("Image services");
    expect(markup).toContain("Process services");
  });
});
