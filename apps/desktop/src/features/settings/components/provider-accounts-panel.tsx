import { Button, Spinner } from "@lifecycle/ui";
import type { AgentSessionProviderId } from "@lifecycle/contracts";
import type { AgentAuthStatus } from "@lifecycle/agents";
import { AgentClientProvider, useAgentAuth, useAgentClientRegistry } from "@lifecycle/agents/react";
import { CheckCircle2, AlertCircle, LogIn } from "lucide-react";
import { useEffect } from "react";
import { useSettings } from "@/features/settings/state/settings-context";
import { ClaudeIcon, CodexIcon } from "@/features/workspaces/surfaces/surface-icons";

function ProviderIcon({ provider, size }: { provider: AgentSessionProviderId; size: number }) {
  switch (provider) {
    case "claude":
      return <ClaudeIcon size={size} />;
    case "codex":
      return <CodexIcon size={size} />;
  }
}

const providerLabels: Record<AgentSessionProviderId, string> = {
  claude: "Claude",
  codex: "Codex",
};

function ProviderAccountCard({ provider }: { provider: AgentSessionProviderId }) {
  const { harnesses } = useSettings();
  const { check, login, status } = useAgentAuth(
    provider,
    provider === "claude" ? { loginMethod: harnesses.claude.loginMethod } : undefined,
  );

  useEffect(() => {
    if (status.state === "not_checked") {
      void check();
    }
  }, [check, status.state]);

  const label = providerLabels[provider];

  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <div className="flex items-center gap-3">
        <ProviderIcon provider={provider} size={18} />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
          <ProviderStatusText status={status} />
        </div>
      </div>
      <ProviderAction login={login} status={status} />
    </div>
  );
}

function ProviderStatusText({ status }: { status: AgentAuthStatus }) {
  switch (status.state) {
    case "not_checked":
    case "checking":
      return (
        <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
          <Spinner className="size-3" /> Checking...
        </span>
      );
    case "authenticating":
      return (
        <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
          <Spinner className="size-3" /> Signing in... check your browser
        </span>
      );
    case "authenticated":
      return (
        <span className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
          <CheckCircle2 className="size-3" /> Connected{status.email ? ` as ${status.email}` : ""}
        </span>
      );
    case "unauthenticated":
      return <span className="text-xs text-[var(--muted-foreground)]">Not connected</span>;
    case "error":
      return (
        <span className="flex items-center gap-1.5 text-xs text-[var(--destructive)]">
          <AlertCircle className="size-3" /> {status.message}
        </span>
      );
  }
}

function ProviderAction({
  login,
  status,
}: {
  login: () => Promise<AgentAuthStatus>;
  status: AgentAuthStatus;
}) {
  const isLoading = status.state === "checking" || status.state === "authenticating";

  if (status.state === "authenticated") {
    return null;
  }

  if (status.state === "not_checked" || status.state === "checking") {
    return null;
  }

  return (
    <Button disabled={isLoading} onClick={() => void login()} size="sm" variant="outline">
      {isLoading ? (
        <Spinner className="size-3.5" />
      ) : (
        <>
          <LogIn className="size-3.5" />
          <span>Sign in</span>
        </>
      )}
    </Button>
  );
}

export function ProviderAccountsPanel() {
  const localAgentClient = useAgentClientRegistry().resolve("local");

  return (
    <AgentClientProvider agentClient={localAgentClient}>
      <div className="space-y-2">
        <ProviderAccountCard provider="claude" />
        <ProviderAccountCard provider="codex" />
      </div>
    </AgentClientProvider>
  );
}
