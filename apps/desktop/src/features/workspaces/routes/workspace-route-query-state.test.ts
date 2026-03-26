import { describe, expect, test } from "bun:test";
import {
  hasBlockingQueryError,
  hasBlockingQueryLoad,
} from "@/features/workspaces/routes/workspace-route-query-state";

describe("workspace route query helpers", () => {
  test("hasBlockingQueryLoad is true when loading with no data", () => {
    expect(hasBlockingQueryLoad({ data: undefined, isLoading: true })).toBe(true);
  });

  test("hasBlockingQueryLoad is false once data is present", () => {
    expect(hasBlockingQueryLoad({ data: {}, isLoading: true })).toBe(false);
  });

  test("hasBlockingQueryError is true when errored with no data", () => {
    expect(hasBlockingQueryError({ data: undefined, error: new Error("fail") })).toBe(true);
  });

  test("hasBlockingQueryError is false when data is present despite error", () => {
    expect(hasBlockingQueryError({ data: {}, error: new Error("fail") })).toBe(false);
  });
});
