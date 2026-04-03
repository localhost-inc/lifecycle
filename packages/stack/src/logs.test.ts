import { describe, expect, test } from "bun:test";
import { recordWorkspaceServiceLogLine, selectWorkspaceServiceLogs } from "./logs";

describe("environment logs", () => {
  test("records and groups log lines by workspace and service", () => {
    const logsByWorkspace = new Map<
      string,
      Map<string, Array<{ stream: "stdout"; text: string }>>
    >();

    recordWorkspaceServiceLogLine(logsByWorkspace, {
      line: { stream: "stdout", text: "server ready" },
      serviceName: "web",
      workspaceId: "workspace_1",
    });
    recordWorkspaceServiceLogLine(logsByWorkspace, {
      line: { stream: "stdout", text: "api ready" },
      serviceName: "api",
      workspaceId: "workspace_1",
    });

    expect(selectWorkspaceServiceLogs(logsByWorkspace, "workspace_1")).toEqual([
      { lines: [{ stream: "stdout", text: "api ready" }], name: "api" },
      { lines: [{ stream: "stdout", text: "server ready" }], name: "web" },
    ]);
  });

  test("caps service logs when a max line count is provided", () => {
    const logsByWorkspace = new Map<
      string,
      Map<string, Array<{ stream: "stdout"; text: string }>>
    >();

    recordWorkspaceServiceLogLine(logsByWorkspace, {
      line: { stream: "stdout", text: "line 1" },
      maxLinesPerService: 2,
      serviceName: "web",
      workspaceId: "workspace_1",
    });
    recordWorkspaceServiceLogLine(logsByWorkspace, {
      line: { stream: "stdout", text: "line 2" },
      maxLinesPerService: 2,
      serviceName: "web",
      workspaceId: "workspace_1",
    });
    recordWorkspaceServiceLogLine(logsByWorkspace, {
      line: { stream: "stdout", text: "line 3" },
      maxLinesPerService: 2,
      serviceName: "web",
      workspaceId: "workspace_1",
    });

    expect(selectWorkspaceServiceLogs(logsByWorkspace, "workspace_1")).toEqual([
      {
        lines: [
          { stream: "stdout", text: "line 2" },
          { stream: "stdout", text: "line 3" },
        ],
        name: "web",
      },
    ]);
  });
});
