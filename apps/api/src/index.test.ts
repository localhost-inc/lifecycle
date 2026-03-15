import { describe, expect, test } from "bun:test";

import { getApiResponse } from "./index";

describe("api scaffold", () => {
  test("builds a deterministic response", () => {
    expect(getApiResponse("/health")).toEqual({
      status: 200,
      body: "Lifecycle API scaffold is running. path=/health",
    });
  });
});
