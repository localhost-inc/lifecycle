import { getWorkerResponse } from "./index";

const port = Number(process.env.LIFECYCLE_WORKER_PORT ?? "8787");

const server = Bun.serve({
  port,
  fetch(request: Request) {
    const url = new URL(request.url);
    const response = getWorkerResponse(url.pathname);
    return new Response(`${response.body}\n`, { status: response.status });
  },
});

console.log(`[worker] scaffold listening on http://localhost:${server.port}`);
