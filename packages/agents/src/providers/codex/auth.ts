import type { ProviderAuthEvent } from "../auth";

function emit(event: ProviderAuthEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

export async function checkCodexAuth(): Promise<void> {
  emit({
    kind: "auth.result",
    provider: "codex",
    state: "unauthenticated",
    message: "Codex authentication is not available yet.",
  });
}

export async function loginCodexAuth(): Promise<void> {
  emit({
    kind: "auth.result",
    provider: "codex",
    state: "error",
    message: "Codex authentication is not implemented yet.",
  });
}
