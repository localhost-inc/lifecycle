import { defineConfig } from "routedjs";

export default defineConfig({
  routesDir: "./routes",
  outFile: "./routed.gen.ts",
  framework: "hono",
});
