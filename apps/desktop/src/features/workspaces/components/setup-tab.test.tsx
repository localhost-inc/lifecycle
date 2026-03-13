import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveSetupPresentation, SetupTab } from "./setup-tab";
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

describe("SetupTab", () => {
  test("renders setup summary and full step output", () => {
    const markup = renderToStaticMarkup(
      createElement(SetupTab, {
        setupSteps: runningSteps,
        workspace: {
          failure_reason: null,
          status: "starting",
        },
      }),
    );

    expect(markup).toContain("Running");
    expect(markup).toContain("write-local-env in progress");
    expect(markup).toContain("Step 2 of 2");
    expect(markup).toContain("1/2");
    expect(markup).toContain("install");
    expect(markup).toContain("bun install --frozen-lockfile");
    expect(markup).toContain("write-local-env");
    expect(markup).toContain("Wrote .env.local");
  });

  test("shows an empty state when no setup steps exist", () => {
    const markup = renderToStaticMarkup(
      createElement(SetupTab, {
        declaredStepNames: [],
        setupSteps: [],
        workspace: {
          failure_reason: null,
          status: "idle",
        },
      }),
    );

    expect(markup).toContain("No setup activity yet");
  });

  test("falls back to declared setup steps when no activity was captured yet", () => {
    const markup = renderToStaticMarkup(
      createElement(SetupTab, {
        declaredStepNames: ["install", "write-local-env"],
        setupSteps: [],
        workspace: {
          failure_reason: null,
          status: "idle",
        },
      }),
    );

    expect(markup).toContain("install");
    expect(markup).toContain("write-local-env");
    expect(markup).not.toContain("No setup activity yet");
  });
});

describe("deriveSetupPresentation", () => {
  test("resolves failed setup when the workspace stops on setup_step_failed", () => {
    const presentation = deriveSetupPresentation(
      [
        {
          name: "install",
          output: ["bun install"],
          status: "failed",
        },
      ],
      {
        failure_reason: "setup_step_failed",
        status: "idle",
      },
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.phase).toBe("failed");
    expect(presentation?.title).toBe("install failed");
    expect(presentation?.completedSteps).toBe(0);
  });
});
