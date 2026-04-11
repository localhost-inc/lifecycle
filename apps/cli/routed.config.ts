import { defineConfig } from "routedjs";
import { bridgeOpenApiConfig } from "./src/bridge/lib/http/openapi-config";

export default defineConfig({
  routesDir: "./src/bridge/routes",
  outFile: "./src/bridge/routed.gen.ts",
  framework: "hono",
  openapi: {
    title: bridgeOpenApiConfig.info.title,
    version: bridgeOpenApiConfig.info.version,
    description: bridgeOpenApiConfig.info.description,
    specVersion: bridgeOpenApiConfig.specVersion,
    outFile: "./src/bridge/openapi.json",
  },
});
