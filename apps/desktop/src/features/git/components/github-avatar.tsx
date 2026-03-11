import { useState } from "react";

function authorHue(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

function avatarUrl(email: string): string | null {
  if (!email) return null;
  // GitHub noreply emails: {id}+{username}@users.noreply.github.com
  const noreply = email.match(/^(\d+\+)?(.+)@users\.noreply\.github\.com$/);
  if (noreply) return `https://github.com/${noreply[2]}.png?size=40`;
  // For other emails, try GitHub's email-based avatar lookup
  return `https://avatars.githubusercontent.com/u/e?email=${encodeURIComponent(email)}&s=40`;
}

interface GithubAvatarProps {
  name: string;
  email: string;
  size?: "sm" | "md";
}

const sizeClasses = {
  sm: { img: "h-4 w-4", fallback: "h-4 w-4 text-[9px]" },
  md: { img: "h-6 w-6", fallback: "h-6 w-6 text-[11px]" },
} as const;

export function GithubAvatar({ name, email, size = "md" }: GithubAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = avatarUrl(email);
  const hue = authorHue(name);
  const letter = name.charAt(0).toUpperCase();
  const classes = sizeClasses[size];

  if (url && !imgFailed) {
    return (
      <img
        src={url}
        alt={name}
        className={`${classes.img} shrink-0 rounded-full`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className={`flex ${classes.fallback} shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white`}
      style={{ backgroundColor: `hsl(${hue}, 50%, 45%)` }}
    >
      {letter}
    </div>
  );
}
