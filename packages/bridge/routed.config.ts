import { defineConfig } from "routedjs";
import { bridgeOpenApiConfig } from "./src/lib/http/openapi-config";

export default defineConfig({
  routesDir: "./routes",
  outFile: "./routed.gen.ts",
  framework: "hono",
  openapi: {
    title: bridgeOpenApiConfig.info.title,
    version: bridgeOpenApiConfig.info.version,
    description: bridgeOpenApiConfig.info.description,
    specVersion: bridgeOpenApiConfig.specVersion,
    outFile: "./openapi.json",
  },
});
