import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));
const desktopAppDir = dirname(srcDir);
const appIconSvg = readFileSync(join(desktopAppDir, "src-tauri", "app-icon.svg"), "utf8");

describe("desktop app icon contract", () => {
  test("preserves the rounded shell used by generated bundle assets", () => {
    expect(appIconSvg).toContain('<svg width="512" height="512" viewBox="0 0 512 512"');
    expect(appIconSvg).toContain('<clipPath id="icon-clip">');
    expect(appIconSvg).toContain('<rect x="44" y="44" width="424" height="424" rx="104"/>');
    expect(appIconSvg).toContain('clip-path="url(#icon-clip)"');
  });
});
