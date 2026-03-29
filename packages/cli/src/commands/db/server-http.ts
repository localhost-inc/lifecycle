import type { DbServerResponse } from "@lifecycle/db/server";

export const DB_SERVER_CORS_HEADERS = {
  "access-control-allow-headers": "content-type, x-lifecycle-db-token",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
  "access-control-max-age": "86400",
} satisfies Record<string, string>;

export function jsonResponse(response: DbServerResponse): Response {
  return new Response(JSON.stringify(response), {
    headers: {
      ...DB_SERVER_CORS_HEADERS,
      "content-type": "application/json",
    },
  });
}

export function optionsResponse(): Response {
  return new Response(null, {
    headers: DB_SERVER_CORS_HEADERS,
    status: 204,
  });
}
