import { describe, expect, test } from "bun:test";

import { getLandingPageResponse } from "./index";

describe("landing page", () => {
  test("serves the homepage for root requests", async () => {
    const response = await getLandingPageResponse("/");

    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/html; charset=utf-8");
    expect(response.body).toContain("<title>Lifecycle</title>");
    expect(response.body).toContain(
      "Desktop-first workspace runtime for local-first software work.",
    );
    expect(response.body).toContain("lifecycle</h1>");
  });

  test("serves a health endpoint", async () => {
    const response = await getLandingPageResponse("/health");

    expect(response).toEqual({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: "ok",
    });
  });
});
