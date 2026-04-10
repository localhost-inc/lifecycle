import { describe, expect, test } from "bun:test";

import {
  stackLogDir,
  stackLogFileName,
  stackLogFilePath,
  stackLogPathSegments,
} from "./path";

describe("stack log path", () => {
  test("builds a slug-scoped path without an organization segment", () => {
    const scope = {
      repositorySlug: "hello-world",
      workspaceSlug: "feature-x",
    };

    expect(stackLogPathSegments(scope)).toEqual(["logs", "hello-world", "feature-x"]);
    expect(stackLogDir("/tmp/lifecycle", scope)).toBe("/tmp/lifecycle/logs/hello-world/feature-x");
    expect(stackLogFilePath("/tmp/lifecycle", scope, "web", "stdout")).toBe(
      "/tmp/lifecycle/logs/hello-world/feature-x/web.stdout.log",
    );
  });

  test("includes organization scope when present", () => {
    const scope = {
      organizationSlug: "kin",
      repositorySlug: "hello-world",
      workspaceSlug: "feature-x",
    };

    expect(stackLogPathSegments(scope)).toEqual(["logs", "kin", "hello-world", "feature-x"]);
  });

  test("encodes service names for file safety", () => {
    expect(stackLogFileName("web/api", "stderr")).toBe("web%2Fapi.stderr.log");
  });
});
