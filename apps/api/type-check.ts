import { Hono } from "hono";
import { hc } from "hono/client";
import { routeHandler } from "routedjs/hono";
import { createRoute } from "routedjs";
import type { AppType } from "./src/worker";

// Hand-written Hono route — types work
const manual = new Hono()
  .get("/health", (c) => c.json({ ok: true }));

async function testManual() {
  const client = hc<typeof manual>("http://localhost");
  const res = await client.health.$get();
  const data = await res.json();
  const a: { ok: boolean } = data;  // should pass
  const b: { wrong: number } = data; // should fail
}

// Generated routeHandler — types lost
const route = createRoute({ handler: async () => ({ ok: true }) });
const generated = new Hono()
  .get("/health", routeHandler(route, "/health"));

async function testGenerated() {
  const client = hc<typeof generated>("http://localhost");
  const res = await client.health.$get();
  const data = await res.json();
  const c: { ok: boolean } = data;  // should pass
  const d: { wrong: number } = data; // should fail
}

// Full app from generated routes
async function testApp() {
  const client = hc<AppType>("http://localhost");
  const res = await client.health.$get();
  const data = await res.json();
  const e: { ok: boolean } = data;  // should pass
  const f: { wrong: number } = data; // should fail
}
