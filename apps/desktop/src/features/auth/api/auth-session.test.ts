import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthSession } from "@/features/auth/auth-session";

const invokeTauri = mock(
  async () =>
    ({
      identity: {
        avatarUrl: "https://avatars.githubusercontent.com/u/14184138?v=4",
        displayName: "Kyle Alwyn",
        handle: "kylealwyn",
      },
      message: null,
      provider: "github",
      source: "local_cli",
      state: "logged_in",
    }) satisfies AuthSession,
);
const fetchMock = mock(
  async () =>
    new Response(
      JSON.stringify({
        identity: {
          avatarUrl: "https://avatars.githubusercontent.com/u/14184138?v=4",
          displayName: "Kyle Alwyn",
          handle: "kylealwyn",
        },
        message: null,
        provider: "github",
        source: "local_cli",
        state: "logged_in",
      } satisfies AuthSession),
      {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      },
    ),
);

mock.module("../../../lib/tauri-error", () => ({
  invokeTauri,
}));

const { readCurrentAuthSession, readLocalDevAuthSession } = await import("./auth-session");

describe("auth session api", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    invokeTauri.mockClear();
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
    globalThis.fetch = originalFetch;
  });

  test("routes auth status lookup through the desktop control plane", async () => {
    expect(await readCurrentAuthSession()).toEqual({
      identity: {
        avatarUrl: "https://avatars.githubusercontent.com/u/14184138?v=4",
        displayName: "Kyle Alwyn",
        handle: "kylealwyn",
      },
      message: null,
      provider: "github",
      source: "local_cli",
      state: "logged_in",
    });
    expect(invokeTauri).toHaveBeenCalledWith("get_auth_session");
  });

  test("reads the local dev auth session outside tauri", async () => {
    expect(await readLocalDevAuthSession()).toEqual({
      identity: {
        avatarUrl: "https://avatars.githubusercontent.com/u/14184138?v=4",
        displayName: "Kyle Alwyn",
        handle: "kylealwyn",
      },
      message: null,
      provider: "github",
      source: "local_cli",
      state: "logged_in",
    });
    expect(fetchMock).toHaveBeenCalledWith("/__dev/auth/session", {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });
  });
});
