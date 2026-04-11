import { describe, expect, test } from "bun:test";

import { app } from "./app";

describe("bridge openapi route", () => {
  test("serves the generated OpenAPI document without bridge runtime state", async () => {
    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      info: { title: string };
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(payload.openapi).toBe("3.0.3");
    expect(payload.info.title).toBe("Lifecycle Bridge API");
    expect(payload.paths["/repos"]).toBeDefined();
    expect(payload.paths["/workspaces/{id}/shell"]).toBeDefined();
  });
});
