import { describe, expect, test } from "bun:test";
import { buildLoggedOutAuthSession } from "./index";

describe("@lifecycle/auth", () => {
  test("builds a logged-out auth session by default", () => {
    expect(buildLoggedOutAuthSession()).toEqual({
      identity: null,
      message: null,
      provider: null,
      source: null,
      state: "logged_out",
    });
  });

  test("allows explicit logged-out metadata overrides", () => {
    expect(
      buildLoggedOutAuthSession({
        message: "GitHub CLI is not authenticated locally.",
        provider: "github",
        source: "local_cli",
      }),
    ).toEqual({
      identity: null,
      message: "GitHub CLI is not authenticated locally.",
      provider: "github",
      source: "local_cli",
      state: "logged_out",
    });
  });
});
