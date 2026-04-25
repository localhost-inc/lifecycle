import { describe, expect, test } from "bun:test";

import { LifecycleSettingsSchema, LifecycleSettingsUpdateSchema } from "./settings";

describe("settings contracts", () => {
  test("defaults appearance fonts under the nested fonts hierarchy", () => {
    expect(LifecycleSettingsSchema.parse({}).appearance.fonts).toEqual({
      ui: "Geist",
      code: "Geist Mono",
    });
  });

  test("accepts partial appearance font updates", () => {
    expect(
      LifecycleSettingsUpdateSchema.parse({
        appearance: {
          fonts: {
            code: "JetBrains Mono",
          },
        },
      }),
    ).toEqual({
      appearance: {
        fonts: {
          code: "JetBrains Mono",
        },
      },
    });
  });
});
