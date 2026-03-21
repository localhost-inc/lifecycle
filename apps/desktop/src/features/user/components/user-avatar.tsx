import { Spinner } from "@lifecycle/ui";
import { CircleUserRound } from "lucide-react";
import { useState } from "react";
import type { AuthSession } from "@/features/auth/auth-session";

function avatarHue(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

interface UserAvatarProps {
  loading: boolean;
  session: AuthSession;
  /** Pixel size of the avatar. Defaults to 20. */
  size?: number;
}

export function UserAvatar({ loading, session, size = 20 }: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const identity = session.identity;
  const avatarUrl = session.state === "logged_in" ? (identity?.avatarUrl ?? null) : null;
  const seed = identity?.handle ?? identity?.displayName ?? session.provider ?? "lifecycle";

  const rem = `${size / 16}rem`;
  const style = { width: rem, height: rem };
  const base = "shrink-0 rounded-full";

  if (loading) {
    return (
      <span
        className={`flex items-center justify-center ${base} bg-[var(--muted)] text-[var(--muted-foreground)]`}
        style={style}
      >
        <Spinner className={size >= 40 ? "size-4" : "size-3"} />
      </span>
    );
  }

  if (avatarUrl && !imageFailed) {
    return (
      <img
        alt={identity?.displayName ?? identity?.handle ?? "Account"}
        className={`${base} object-cover`}
        onError={() => setImageFailed(true)}
        src={avatarUrl}
        style={style}
      />
    );
  }

  if (session.state === "logged_in") {
    const letter = (identity?.displayName ?? identity?.handle ?? "L").charAt(0).toUpperCase();
    return (
      <span
        className={`flex items-center justify-center ${base} font-semibold leading-none text-white`}
        style={{
          ...style,
          fontSize: `${(size * 0.4) / 16}rem`,
          backgroundColor: `hsl(${avatarHue(seed)}, 48%, 44%)`,
        }}
      >
        {letter}
      </span>
    );
  }

  return (
    <span
      className={`flex items-center justify-center ${base} bg-[var(--muted)] text-[var(--muted-foreground)]`}
      style={style}
    >
      <CircleUserRound size={Math.round(size * 0.55)} strokeWidth={1.8} />
    </span>
  );
}
