import { Hono } from "hono";
import { app as routedApp } from "../../../routed.gen";
import { BridgeError } from "../errors";
import { bridgeOpenApiSpec } from "./openapi";

let configured = false;
const bridgeApp = new Hono();

function configureBridgeApp() {
  if (configured) {
    return bridgeApp;
  }

  bridgeApp.get("/openapi.json", (ctx) => ctx.json(bridgeOpenApiSpec));
  bridgeApp.route("", routedApp);
  bridgeApp.onError((error, ctx) => {
    const message =
      error instanceof Error
        ? error.message
        : `Bridge request failed because a non-Error value was thrown: ${String(error)}`;
    const status: 400 | 401 | 403 | 404 | 409 | 422 | 500 =
      error instanceof BridgeError ? error.status : 500;
    const code = error instanceof BridgeError ? error.code : "internal_error";
    return ctx.json(
      {
        error: {
          code,
          message,
        },
      },
      status,
    );
  });

  configured = true;
  return bridgeApp;
}

export const app = configureBridgeApp();
