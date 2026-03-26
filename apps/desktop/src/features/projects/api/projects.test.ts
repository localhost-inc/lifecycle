import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as tauriError from "@/lib/tauri-error";
import { readManifest } from "./projects";

const invokeTauriMock = mock(
  async (): Promise<string | null> =>
    `{"workspace":{"prepare":[{"name":"install","command":"bun install","timeout_seconds":300}]},"environment":{"api":{"kind":"service","runtime":"process","command":"bun run dev"}}}`,
);

describe("projects api", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    invokeTauriMock.mockClear();
    mock.module("@/lib/tauri-error", () => ({
      ...tauriError,
      invokeTauri: invokeTauriMock,
    }));
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes manifest reads through the runtime before parsing", async () => {
    const result = await readManifest("/tmp/project_1");

    expect(result.state).toBe("valid");
    expect(invokeTauriMock).toHaveBeenCalledWith("read_manifest_text", {
      dirPath: "/tmp/project_1",
    });
  });

  test("treats missing runtime manifest text as a missing manifest", async () => {
    invokeTauriMock.mockResolvedValueOnce(null);

    await expect(readManifest("/tmp/project_1")).resolves.toEqual({ state: "missing" });
  });
});
