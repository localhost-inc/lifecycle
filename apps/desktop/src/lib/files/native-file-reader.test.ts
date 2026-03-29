import { describe, expect, test } from "bun:test";
import { createNativeFileReader } from "./native-file-reader";

describe("createNativeFileReader", () => {
  test("checks file existence through the native file capability", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const reader = createNativeFileReader(async (command, args) => {
      calls.push(args ? { command, args } : { command });
      return true;
    });

    await expect(reader.exists("/tmp/project/lifecycle.json")).resolves.toBe(true);
    expect(calls).toEqual([
      {
        command: "file_exists",
        args: {
          rootPath: "/tmp/project",
          filePath: "lifecycle.json",
        },
      },
    ]);
  });

  test("reads text through the native read_file capability", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const reader = createNativeFileReader(async (command, args) => {
      calls.push(args ? { command, args } : { command });
      return {
        content: "{}",
      };
    });

    await expect(reader.readTextFile("/tmp/project/lifecycle.json")).resolves.toBe("{}");
    expect(calls).toEqual([
      {
        command: "read_file",
        args: {
          rootPath: "/tmp/project",
          filePath: "lifecycle.json",
        },
      },
    ]);
  });

  test("fails loudly when the file cannot be read as text", async () => {
    const reader = createNativeFileReader(async () => ({
      content: null,
    }));

    await expect(reader.readTextFile("/tmp/project/lifecycle.json")).rejects.toThrow(
      'File "/tmp/project/lifecycle.json" could not be read as text.',
    );
  });
});
