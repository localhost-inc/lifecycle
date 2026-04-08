import { describe, expect, test } from "bun:test";
import { bridgeRegistrationLookupPaths, bridgeRegistrationPath } from "./registration";

describe("bridge registration", () => {
  test("prefers explicit bridge registration path", () => {
    expect(
      bridgeRegistrationPath({
        LIFECYCLE_BRIDGE_REGISTRATION: "/tmp/custom-bridge.json",
        LIFECYCLE_RUNTIME_ROOT: "/tmp/runtime-root",
      }),
    ).toBe("/tmp/custom-bridge.json");
  });

  test("respects LIFECYCLE_RUNTIME_ROOT", () => {
    expect(bridgeRegistrationPath({ LIFECYCLE_RUNTIME_ROOT: "/tmp/lifecycle-runtime" })).toBe(
      "/tmp/lifecycle-runtime/bridge.json",
    );
  });

  test("falls back to lifecycle root when runtime root is unset", () => {
    expect(bridgeRegistrationPath({ LIFECYCLE_ROOT: "/tmp/lifecycle-data" })).toBe(
      "/tmp/lifecycle-data/bridge.json",
    );
  });

  test("looks up both current and default runtime registrations when runtime root is overridden", () => {
    expect(
      bridgeRegistrationLookupPaths({
        LIFECYCLE_ROOT: "/tmp/lifecycle-data",
        LIFECYCLE_RUNTIME_ROOT: "/tmp/lifecycle-runtime",
      }),
    ).toEqual(["/tmp/lifecycle-runtime/bridge.json", "/tmp/lifecycle-data/bridge.json"]);
  });

  test("dedupes the registration path when runtime root is not overridden", () => {
    expect(
      bridgeRegistrationLookupPaths({
        LIFECYCLE_ROOT: "/tmp/lifecycle-data",
      }),
    ).toEqual(["/tmp/lifecycle-data/bridge.json"]);
  });
});
