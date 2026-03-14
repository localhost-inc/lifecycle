export function detectPlatformHint(): string {
  if (typeof navigator === "undefined") {
    return "";
  }

  const userAgentDataPlatform =
    "userAgentData" in navigator &&
    typeof navigator.userAgentData === "object" &&
    navigator.userAgentData !== null &&
    "platform" in navigator.userAgentData
      ? String(navigator.userAgentData.platform)
      : undefined;

  return (userAgentDataPlatform ?? navigator.platform ?? navigator.userAgent).trim().toLowerCase();
}

export function shouldInsetForWindowControls(
  platformHint: string | null | undefined,
  tauriEnvironment: boolean,
): boolean {
  if (!tauriEnvironment) {
    return false;
  }

  return platformHint?.trim().toLowerCase().includes("mac") ?? false;
}
