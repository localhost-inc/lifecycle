import { getApiResponse } from "./index";

const port = Number(process.env.LIFECYCLE_SERVICE_API_PORT ?? process.env.PORT ?? "8787");

const server = Bun.serve({
  port,
  fetch(request: Request) {
    const url = new URL(request.url);
    const response = getApiResponse(url.pathname);
    return new Response(`${response.body}\n`, { status: response.status });
  },
});

console.log(`[api] scaffold listening on http://localhost:${server.port}`);
