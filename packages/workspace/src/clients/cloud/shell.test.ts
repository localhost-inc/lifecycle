import { describe, expect, test } from "bun:test";

import { buildCloudShellSshArgs } from "./shell";

describe("buildCloudShellSshArgs", () => {
  test("opens a raw interactive ssh shell when no entry command is requested", () => {
    expect(
      buildCloudShellSshArgs({
        cwd: "/workspace/repo",
        home: "/home/lifecycle",
        host: "ssh.app.daytona.io",
        token: "tok_123",
      }),
    ).toEqual([
      "-tt",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "LogLevel=ERROR",
      "tok_123@ssh.app.daytona.io",
    ]);
  });

  test("boots a shell command through a login shell", () => {
    expect(
      buildCloudShellSshArgs(
        {
          cwd: "/workspace/repo",
          home: "/home/lifecycle",
          host: "ssh.app.daytona.io",
          token: "tok_123",
        },
        { entryCommandText: "claude" },
      ),
    ).toEqual([
      "-tt",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "LogLevel=ERROR",
      "tok_123@ssh.app.daytona.io",
      `exec "\${SHELL:-/bin/bash}" -lic 'cd '"'"'/workspace/repo'"'"' && claude'`,
    ]);
  });
});
