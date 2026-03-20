import { Button, Spinner } from "@lifecycle/ui";
import { RefreshCcw } from "lucide-react";
import type { AuthSession } from "@/features/auth/auth-session";
import { UserAvatar } from "@/features/user/components/user-avatar";

interface AuthSessionSettingsPanelProps {
  isLoading: boolean;
  onRefresh: () => void;
  session: AuthSession;
}

export function AuthSessionSettingsPanel({
  isLoading,
  onRefresh,
  session,
}: AuthSessionSettingsPanelProps) {
  const identityLabel =
    session.identity?.displayName ?? session.identity?.handle ?? "No active account";
  const handleLabel = session.identity?.handle ? `@${session.identity.handle}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <UserAvatar loading={isLoading} session={session} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--foreground)]">{identityLabel}</p>
          {handleLabel ? (
            <p className="truncate text-sm text-[var(--muted-foreground)]">{handleLabel}</p>
          ) : null}
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
