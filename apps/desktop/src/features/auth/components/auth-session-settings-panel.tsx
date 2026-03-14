import { Button, Spinner } from "@lifecycle/ui";
import { CircleUserRound, RefreshCcw } from "lucide-react";
import { useState } from "react";
import type { AuthSession } from "../auth-session";

interface AuthSessionSettingsPanelProps {
  environmentLabel: string;
  isLoading: boolean;
  onRefresh: () => void;
  session: AuthSession;
}

function authAvatarHue(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) | 0;
  }
  return ((hash % 360) + 360) % 360;
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

function AuthSessionAvatar({
  isLoading,
  session,
}: Pick<AuthSessionSettingsPanelProps, "isLoading" | "session">) {
  const [imageFailed, setImageFailed] = useState(false);
  const identity = session.identity;
  const avatarUrl = session.state === "logged_in" ? (identity?.avatarUrl ?? null) : null;
  const avatarSeed = identity?.handle ?? identity?.displayName ?? session.provider ?? "lifecycle";

  if (isLoading) {
    return (
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel),var(--foreground)_4%)]">
        <Spinner className="size-4 text-[var(--muted-foreground)]" />
      </div>
    );
  }

  if (avatarUrl && !imageFailed) {
    return (
      <img
        alt={identity?.displayName ?? identity?.handle ?? "Account"}
        className="size-12 shrink-0 rounded-full border border-[color-mix(in_srgb,var(--border),var(--foreground)_8%)] object-cover"
        onError={() => setImageFailed(true)}
        src={avatarUrl}
      />
    );
  }

  if (session.state === "logged_in") {
    const letter = (identity?.displayName ?? identity?.handle ?? "L").charAt(0).toUpperCase();
    return (
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
        style={{ backgroundColor: `hsl(${authAvatarHue(avatarSeed)}, 48%, 44%)` }}
      >
        {letter}
      </div>
    );
  }

  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel),var(--foreground)_4%)] text-[var(--muted-foreground)]">
      <CircleUserRound size={22} strokeWidth={1.8} />
    </div>
  );
}

export function AuthSessionSettingsPanel({
  environmentLabel,
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
        <AuthSessionAvatar isLoading={isLoading} session={session} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-[var(--foreground)]">{identityLabel}</p>
            <span
              className={[
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
                isSignedIn
                  ? "border-[color-mix(in_srgb,var(--border),var(--foreground)_12%)] bg-[color-mix(in_srgb,var(--foreground),transparent_94%)] text-[var(--foreground)]"
                  : "border-[var(--border)] bg-[color-mix(in_srgb,var(--panel),var(--foreground)_3%)] text-[var(--muted-foreground)]",
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
        <Button
          className="shrink-0"
          onClick={onRefresh}
          size="sm"
          type="button"
          variant="outline"
        >
          {isLoading ? (
            <Spinner className="size-3.5" />
          ) : (
            <RefreshCcw size={13} strokeWidth={1.9} />
          )}
          {isLoading ? "Refreshing" : "Refresh status"}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel),var(--foreground)_2%)] px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Runtime path
          </p>
          <p className="mt-1 text-sm text-[var(--foreground)]">{environmentLabel}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel),var(--foreground)_2%)] px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Auth source
          </p>
          <p className="mt-1 text-sm text-[var(--foreground)]">
            {providerLabel} · {sourceLabel}
          </p>
        </div>
      </div>

      {session.message ? (
        <p className="text-sm text-[var(--muted-foreground)]">{session.message}</p>
      ) : null}
    </div>
  );
}
