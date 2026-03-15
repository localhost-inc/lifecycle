import { getLandingPageResponse } from "./index";

const port = Number(process.env.LIFECYCLE_SERVICE_WWW_PORT ?? process.env.PORT ?? "3000");

const server = Bun.serve({
  port,
  async fetch(request: Request) {
    const url = new URL(request.url);
    const response = await getLandingPageResponse(url.pathname);

    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.contentType,
      },
    });
  },
});

console.log(`[www] landing page listening on http://localhost:${server.port}`);
