import { expect, test } from "bun:test";
import { cn } from "./cn";

test("cn merges utility classes with tailwind conflict resolution", () => {
  expect(cn("p-2", "p-4", "text-sm", "text-sm")).toBe("p-4 text-sm");
});
