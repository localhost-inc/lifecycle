import { describe, expect, test } from "bun:test";
import { jsonResponse, optionsResponse } from "./server-http";

describe("db server http responses", () => {
  test("jsonResponse includes the DB server CORS headers", async () => {
    const response = jsonResponse({
      ok: true,
      requestId: "test-request",
      result: {
        ok: true,
      },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "content-type, x-lifecycle-db-token",
    );
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({
      ok: true,
      requestId: "test-request",
      result: {
        ok: true,
      },
    });
  });

  test("optionsResponse answers browser preflight requests", () => {
    const response = optionsResponse();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "content-type, x-lifecycle-db-token",
    );
  });
});
