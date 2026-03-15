const sourcePath = new URL("./index.html", import.meta.url);
const outputPath = new URL("../dist/index.html", import.meta.url);

await Bun.write(outputPath, Bun.file(sourcePath));

console.log(`[www] built ${outputPath.pathname}`);
