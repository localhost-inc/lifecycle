import { Button, Spinner } from "@lifecycle/ui";
import { RefreshCcw } from "lucide-react";
import type { AuthSession } from "../auth-session";
import { UserAvatar } from "../../user/components/user-avatar";

interface AuthSessionSettingsPanelProps {
  isLoading: boolean;
  onRefresh: () => void;
  session: AuthSession;
}

function authProviderLabel(session: AuthSession): string {
  if (session.provider === "github") {
    return "GitHub";
  }
  if (session.provider === "workos") {
    return "WorkOS";
  }
  return "None";
}

function authSourceLabel(session: AuthSession): string {
  if (session.source === "local_cli") {
    return "Local CLI";
  }
  if (session.source === "cloud_session") {
    return "Cloud session";
  }
  return "Unavailable";
}

function authStateLabel(session: AuthSession): string {
  return session.state === "logged_in" ? "Signed in" : "Signed out";
}

export function AuthSessionSettingsPanel({
  isLoading,
  onRefresh,
  session,
}: AuthSessionSettingsPanelProps) {
  const providerLabel = authProviderLabel(session);
  const sourceLabel = authSourceLabel(session);
  const stateLabel = authStateLabel(session);
  const identityLabel =
    session.identity?.displayName ?? session.identity?.handle ?? "No active account";
  const handleLabel = session.identity?.handle ? `@${session.identity.handle}` : null;
  const isSignedIn = session.state === "logged_in";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <UserAvatar loading={isLoading} session={session} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-[var(--foreground)]">{identityLabel}</p>
            <span
              className={[
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
                isSignedIn
                  ? "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
              ].join(" ")}
            >
              {stateLabel}
            </span>
          </div>
          {handleLabel ? (
            <p className="truncate text-sm text-[var(--muted-foreground)]">{handleLabel}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {isLoading
              ? "Refreshing\u2026"
              : isSignedIn
                ? `${providerLabel} \u00b7 ${sourceLabel}`
                : "Not connected"}
          </p>
        </div>
        <Button className="shrink-0" onClick={onRefresh} size="sm" type="button" variant="outline">
          {isLoading ? (
            <Spinner className="size-3.5" />
          ) : (
            <RefreshCcw size={13} strokeWidth={1.9} />
          )}
          {isLoading ? "Refreshing" : "Refresh status"}
        </Button>
      </div>

      {session.message ? (
        <p className="text-sm text-[var(--muted-foreground)]">{session.message}</p>
      ) : null}
    </div>
  );
}
