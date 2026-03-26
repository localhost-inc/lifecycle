import { Button, Spinner } from "@lifecycle/ui";
import type { AgentSessionProviderId } from "@lifecycle/contracts";
import { CheckCircle2, AlertCircle, LogIn } from "lucide-react";
import { useEffect } from "react";
import { ClaudeIcon, CodexIcon } from "@/features/workspaces/surfaces/surface-icons";
import {
  checkProviderAuth,
  loginProvider,
  useProviderAuthStatus,
} from "@/features/agents/state/provider-auth-state";

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
  const status = useProviderAuthStatus(provider);

  useEffect(() => {
    if (status.state === "not_checked") {
      void checkProviderAuth(provider);
    }
  }, [provider, status.state]);

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
      <ProviderAction provider={provider} status={status} />
    </div>
  );
}

function ProviderStatusText({ status }: { status: ReturnType<typeof useProviderAuthStatus> }) {
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
  provider,
  status,
}: {
  provider: AgentSessionProviderId;
  status: ReturnType<typeof useProviderAuthStatus>;
}) {
  const isLoading = status.state === "checking" || status.state === "authenticating";

  if (status.state === "authenticated") {
    return null;
  }

  if (status.state === "not_checked" || status.state === "checking") {
    return null;
  }

  return (
    <Button
      disabled={isLoading}
      onClick={() => void loginProvider(provider)}
      size="sm"
      variant="outline"
    >
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
  return (
    <div className="space-y-2">
      <ProviderAccountCard provider="claude" />
      <ProviderAccountCard provider="codex" />
    </div>
  );
}
