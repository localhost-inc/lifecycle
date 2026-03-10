export function buildOverlayHostUrl(ownerWindowLabel: string, origin?: string): string {
  const url = new URL("/overlay-host", origin ?? "https://overlay-host.invalid");
  url.searchParams.set("ownerWindowLabel", ownerWindowLabel);

  if (!origin) {
    return `${url.pathname}${url.search}`;
  }

  return url.toString();
}

export function readOverlayHostOwnerWindowLabel(search: string): string | null {
  const ownerWindowLabel = new URLSearchParams(search).get("ownerWindowLabel");
  if (!ownerWindowLabel || ownerWindowLabel.trim().length === 0) {
    return null;
  }

  return ownerWindowLabel;
}
