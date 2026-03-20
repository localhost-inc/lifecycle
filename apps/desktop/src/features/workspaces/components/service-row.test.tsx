import type { ServiceRecord } from "@lifecycle/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { resolvePreviewUrl, ServiceRow } from "@/features/workspaces/components/service-row";

const failedService: ServiceRecord = {
  created_at: "2026-03-12T10:00:00.000Z",
  assigned_port: 44446,
  id: "svc-postgres",
  preview_url: null,
  name: "postgres",
  status: "failed",
  status_reason: "service_start_failed",
  updated_at: "2026-03-12T10:00:00.000Z",
  environment_id: "ws-1",
};

describe("ServiceRow", () => {
  test("uses the persisted preview URL as an opaque local preview route", () => {
    expect(
      resolvePreviewUrl({
        ...failedService,
        assigned_port: 3002,
        preview_url: "http://www.frost-beacon-57f59253.lifecycle.localhost:52300",
      }),
    ).toBe("http://www.frost-beacon-57f59253.lifecycle.localhost:52300");
  });

  test("renders a friendly failed-service status reason", () => {
    const markup = renderToStaticMarkup(
      createElement(ServiceRow, {
        runtime: "image",
        service: failedService,
      }),
    );

    expect(markup).toContain("Failed to start");
    expect(markup).not.toContain("service_start_failed");
  });

  test("renders the service name without foregrounding runtime ports", () => {
    const markup = renderToStaticMarkup(
      createElement(ServiceRow, {
        runtime: "image",
        service: failedService,
      }),
    );

    expect(markup).toContain("postgres");
    expect(markup).not.toContain(":44446");
  });

  test("renders expandable chevron when toggle handler is provided", () => {
    const markup = renderToStaticMarkup(
      createElement(ServiceRow, {
        logLines: [{ stream: "stdout", text: "ready" }],
        onToggleExpanded: () => {},
        runtime: "image",
        service: failedService,
      }),
    );

    expect(markup).toContain("chevron");
    expect(markup).not.toContain("Exposure");
  });

  test("renders a compact play button for independently bootable services", () => {
    const markup = renderToStaticMarkup(
      createElement(ServiceRow, {
        onStartService: () => {},
        onToggleExpanded: () => {},
        runtime: "image",
        service: failedService,
      }),
    );

    expect(markup).toContain('aria-label="Run postgres and its dependencies"');
    expect(markup).not.toContain(">Run<");
  });
});
