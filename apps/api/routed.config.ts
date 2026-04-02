import { defineConfig } from "routedjs";

export default defineConfig({
  routesDir: "./routes",
  outFile: "./routed.gen.ts",
  framework: "hono",
  client: {
    outFile: "./routed.client.ts",
  },
});
