import { describe, expect, test } from "bun:test";
import { formatCompactRelativeTime } from "./format";

describe("formatCompactRelativeTime", () => {
  test("returns Now for timestamps within the current minute", () => {
    expect(formatCompactRelativeTime(new Date().toISOString())).toBe("Now");
  });

  test("returns Now for timestamps slightly in the future", () => {
    expect(formatCompactRelativeTime(new Date(Date.now() + 5_000).toISOString())).toBe("Now");
  });

  test("keeps compact minute output for older timestamps", () => {
    expect(formatCompactRelativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m");
  });

  test("treats bare SQLite datetime strings as UTC", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);
    const sqliteFormat = fiveMinutesAgo.toISOString().replace("T", " ").replace("Z", "").split(".")[0];
    expect(formatCompactRelativeTime(sqliteFormat)).toBe("5m");
  });
});
