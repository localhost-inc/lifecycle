import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(scriptDir);
const sourceIcon = join(appDir, "src-tauri", "app-icon.svg");
const outputDir = join(appDir, "src-tauri", "icons");
const tempDir = mkdtempSync(join(tmpdir(), "lifecycle-tauri-icons-"));
const roundedShellRectPattern =
  /<rect[^>]*x="44"[^>]*y="44"[^>]*width="424"[^>]*height="424"[^>]*rx="104"[^>]*\/?>/;
const roundedShellClipPattern = /clip-path="url\(#icon-clip\)"/;
const generatedExtensions = new Set([".png", ".icns", ".ico"]);
const trackedBundleFiles = new Set([
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "Square107x107Logo.png",
  "Square142x142Logo.png",
  "Square150x150Logo.png",
  "Square284x284Logo.png",
  "Square30x30Logo.png",
  "Square310x310Logo.png",
  "Square44x44Logo.png",
  "Square71x71Logo.png",
  "Square89x89Logo.png",
  "StoreLogo.png",
  "icon.icns",
  "icon.ico",
  "icon.png",
]);

function assertRoundedShell(sourceSvg: string): void {
  if (roundedShellRectPattern.test(sourceSvg) && roundedShellClipPattern.test(sourceSvg)) {
    return;
  }

  throw new Error(
    "apps/desktop/src-tauri/app-icon.svg must preserve the rounded 424x424 shell clipped by #icon-clip.",
  );
}

try {
  assertRoundedShell(readFileSync(sourceIcon, "utf8"));

  const result = spawnSync(process.execPath, ["x", "tauri", "icon", sourceIcon, "-o", tempDir], {
    cwd: appDir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  mkdirSync(outputDir, { recursive: true });

  const generatedFiles = readdirSync(tempDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        generatedExtensions.has(extname(entry.name).toLowerCase()) &&
        trackedBundleFiles.has(entry.name),
    )
    .map((entry) => entry.name);

  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      generatedExtensions.has(extname(entry.name).toLowerCase()) &&
      !trackedBundleFiles.has(entry.name)
    ) {
      unlinkSync(join(outputDir, entry.name));
    }
  }

  for (const fileName of generatedFiles) {
    copyFileSync(join(tempDir, fileName), join(outputDir, fileName));
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
