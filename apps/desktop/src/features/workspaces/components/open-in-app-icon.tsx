import type { ReactNode } from "react";
import { cn } from "@lifecycle/ui";
import type { OpenInAppId } from "@/features/workspaces/open-in-api";

function AppIconTile({
  children,
  className,
  sizeClass = "size-6",
}: {
  children: ReactNode;
  className: string;
  sizeClass?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)]/60",
        sizeClass,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OpenInAppIcon({
  appId,
  iconDataUrl,
  sizeClass,
}: {
  appId: OpenInAppId;
  iconDataUrl?: string | null;
  sizeClass?: string;
}) {
  if (iconDataUrl) {
    return (
      <img
        alt=""
        aria-hidden
        className={cn("shrink-0 object-contain", sizeClass ?? "size-6")}
        src={iconDataUrl}
      />
    );
  }

  switch (appId) {
    case "vscode":
      return (
        <AppIconTile className="bg-[#1f9cf0]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-5" viewBox="0 0 24 24">
            <path d="M17.4 3.4 7.7 12l9.7 8.6 2.2-1.1V4.5z" fill="#fff" opacity="0.95" />
            <path d="m7.7 12-4.1-3.7L6 6.8l5.4 5.2L6 17.2l-2.4-1.5z" fill="#dff2ff" />
          </svg>
        </AppIconTile>
      );
    case "cursor":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#202020,#050505)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-4" viewBox="0 0 24 24">
            <path
              d="m8.2 4.5 5 2.9-2.9 5-5-2.9zm7.6 0 3.7 3.7-5 2.9-2.8-5zm-7.6 15 2.9-5 5 2.8-3.7 3.8zm9-2.2-2.8-5 5-2.9v7.9z"
              fill="#f5f5f5"
            />
          </svg>
        </AppIconTile>
      );
    case "windsurf":
      return (
        <AppIconTile className="bg-[#f4f0e7]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-4" viewBox="0 0 24 24">
            <path
              d="M4.5 8.5c2.2 0 2.2 3 4.4 3s2.2-3 4.4-3 2.2 3 4.4 3M4.5 14.8c2.2 0 2.2-3 4.4-3s2.2 3 4.4 3 2.2-3 4.4-3"
              fill="none"
              stroke="#101010"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
            />
          </svg>
        </AppIconTile>
      );
    case "finder":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#68b8ff,#1677ff)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-5" viewBox="0 0 24 24">
            <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7z" fill="#8ed0ff" />
            <path d="M5 3h7v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2" fill="#2f7cff" />
            <path d="M12 4v16" stroke="#081a33" strokeWidth="1.6" />
            <path
              d="M7.2 10.1h1.5m8.1 0h-1.5M8.1 14.8c1.1.9 2.4 1.3 3.9 1.3s2.8-.4 3.9-1.3"
              stroke="#081a33"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
          </svg>
        </AppIconTile>
      );
    case "terminal":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#2f2f32,#101012)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24">
            <path
              d="m6 8 4 4-4 4"
              fill="none"
              stroke="#f4f4f5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
            />
            <path d="M12.8 16h5.2" stroke="#f4f4f5" strokeLinecap="round" strokeWidth="2" />
          </svg>
        </AppIconTile>
      );
    case "iterm":
      return (
        <AppIconTile
          className="bg-[radial-gradient(circle_at_top_left,#3e134f,#090a13_70%)]"
          sizeClass={sizeClass}
        >
          <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24">
            <path
              d="m6 8 3.2 4L6 16"
              fill="none"
              stroke="#45ff7b"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
            />
            <path d="M12.2 16.2H18" stroke="#45ff7b" strokeLinecap="round" strokeWidth="2.2" />
          </svg>
        </AppIconTile>
      );
    case "ghostty":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#4a8dff,#173d9e)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-5" viewBox="0 0 24 24">
            <rect x="4.2" y="5.4" width="15.6" height="13.2" rx="3" fill="#d6e6ff" opacity="0.25" />
            <rect
              x="5.6"
              y="6.8"
              width="12.8"
              height="10.4"
              rx="2.2"
              fill="#0b0f1a"
              opacity="0.85"
            />
            <path
              d="m8.2 10.2 2.4 2.2-2.4 2.2"
              fill="none"
              stroke="#e6f2ff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path d="M12.7 14.3h3.1" stroke="#e6f2ff" strokeLinecap="round" strokeWidth="1.8" />
          </svg>
        </AppIconTile>
      );
    case "warp":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#d8d9de,#8f939d)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24">
            <path
              d="M6.5 7.8 12 12l5.5-4.2v2.7L12 14.6l-5.5-4.1zM6.5 12.1 12 16.2l5.5-4.1v2.8L12 19l-5.5-4.1z"
              fill="#15161a"
            />
          </svg>
        </AppIconTile>
      );
    case "xcode":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#37b2ff,#0b63ff)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24">
            <path d="m6.5 16.8 6.7-6.7 1.8 1.8-6.7 6.7H6.5z" fill="#eaf4ff" />
            <path d="m13.6 7.5 1.9-1.9 2.9 2.9-1.9 1.9z" fill="#a6dbff" />
            <path d="m9.4 9.2 1.6-1.6 4.8 4.8-1.6 1.6z" fill="#0a2354" opacity="0.45" />
            <path d="m5.5 18.5 2.5-.4-.4-2.5z" fill="#ffb457" />
          </svg>
        </AppIconTile>
      );
    default:
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#3f3f46,#18181b)]" sizeClass={sizeClass}>
          <span className="text-[11px] font-semibold text-white">Z</span>
        </AppIconTile>
      );
  }
}
