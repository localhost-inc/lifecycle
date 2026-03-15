const landingPagePath = new URL("./index.html", import.meta.url);

export async function getLandingPageResponse(pathname: string) {
  if (pathname === "/" || pathname === "/index.html") {
    return {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: await Bun.file(landingPagePath).text(),
    } as const;
  }

  if (pathname === "/health") {
    return {
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: "ok",
    } as const;
  }

  return {
    status: 404,
    contentType: "text/plain; charset=utf-8",
    body: "Not found",
  } as const;
}
