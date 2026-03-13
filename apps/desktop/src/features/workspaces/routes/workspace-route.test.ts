import { describe, expect, test } from "bun:test";
import { hasBlockingQueryError, hasBlockingQueryLoad } from "./workspace-route-query-state";

describe("workspace route query gating", () => {
  test("treats only an undefined data load as route-blocking", () => {
    expect(
      hasBlockingQueryLoad({
        data: undefined,
        isLoading: true,
      }),
    ).toBeTrue();

    expect(
      hasBlockingQueryLoad({
        data: null,
        isLoading: true,
      }),
    ).toBeFalse();

    expect(
      hasBlockingQueryLoad({
        data: { workspace: null },
        isLoading: true,
      }),
    ).toBeFalse();
  });

  test("keeps stale data visible when a refetch fails", () => {
    expect(
      hasBlockingQueryError({
        data: undefined,
        error: new Error("boom"),
      }),
    ).toBeTrue();

    expect(
      hasBlockingQueryError({
        data: { workspace: null },
        error: new Error("boom"),
      }),
    ).toBeFalse();
  });
});
