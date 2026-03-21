import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const cliEntryPath = path.resolve(repoRoot, "packages/cli/src/index.ts");
const outputPath = path.resolve(import.meta.dir, "../src-tauri/resources/lifecycle");

await mkdir(path.dirname(outputPath), { recursive: true });

const build = Bun.spawnSync(["bun", "build", cliEntryPath, "--compile", "--outfile", outputPath], {
  cwd: repoRoot,
  stderr: "inherit",
  stdout: "inherit",
});

if (build.exitCode !== 0) {
  process.exit(build.exitCode ?? 1);
}

if (process.platform !== "win32") {
  await chmod(outputPath, 0o755);
}
