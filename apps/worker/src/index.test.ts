import { describe, expect, test } from "bun:test";

import { getWorkerResponse } from "./index";

describe("worker scaffold", () => {
  test("builds a deterministic response", () => {
    expect(getWorkerResponse("/health")).toEqual({
      status: 200,
      body: "Lifecycle worker scaffold is running. path=/health",
    });
  });
});
