import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ProjectRecord } from "@lifecycle/contracts";
import { Button, Spinner } from "@lifecycle/ui";
import { ChevronDown, CircleUserRound, Plus } from "lucide-react";
import { type MouseEvent, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import {
  detectPlatformHint,
  shouldInsetForWindowControls,
} from "../../../components/layout/window-controls";
import type { AuthSession } from "../../auth/auth-session";

interface ProjectSwitcherStripProps {
  activeProjectId: string | null;
  activeContextName?: string;
  authSession: AuthSession;
  authSessionLoading?: boolean;
  onAddProject: () => void;
  onOpenSettings: () => void;
  projects: ProjectRecord[];
  readyProjectIds?: ReadonlySet<string>;
}

function projectMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function authAvatarHue(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

function authSessionTitle(session: AuthSession, loading: boolean): string {
  if (loading) {
    return "Checking current auth session.";
  }

  if (session.state === "logged_in") {
    const provider = session.provider === "workos" ? "WorkOS" : "GitHub";
    const source = session.source === "cloud_session" ? "cloud session" : "local CLI";
    const identityLabel = session.identity?.handle ?? session.identity?.displayName ?? "account";
    return session.message
      ? `${provider} authenticated via ${source} as ${identityLabel}. ${session.message}`
      : `${provider} authenticated via ${source} as ${identityLabel}.`;
  }

  return session.message ?? "No account is currently signed in.";
}

function contextControlTitle(
  activeContextName: string,
  session: AuthSession,
  loading: boolean,
): string {
  return `${activeContextName} context. ${authSessionTitle(session, loading)}`;
}

function AuthSessionAvatar({ loading, session }: { loading: boolean; session: AuthSession }) {
  const [imageFailed, setImageFailed] = useState(false);
  const identity = session.identity;
  const avatarUrl = session.state === "logged_in" ? (identity?.avatarUrl ?? null) : null;
  const avatarSeed = identity?.handle ?? identity?.displayName ?? session.provider ?? "lifecycle";

  if (loading) {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--foreground),transparent_90%)] text-[var(--muted-foreground)]">
        <Spinner className="size-3" />
      </span>
    );
  }

  if (avatarUrl && !imageFailed) {
    return (
      <img
        alt={identity?.displayName ?? identity?.handle ?? "Account"}
        className="size-5 shrink-0 rounded-full"
        onError={() => setImageFailed(true)}
        src={avatarUrl}
      />
    );
  }

  if (session.state === "logged_in") {
    const letter = (identity?.displayName ?? identity?.handle ?? "L").charAt(0).toUpperCase();
    return (
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none text-white"
        style={{ backgroundColor: `hsl(${authAvatarHue(avatarSeed)}, 48%, 44%)` }}
      >
        {letter}
      </span>
    );
  }

  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--foreground),transparent_92%)] text-[var(--muted-foreground)]">
      <CircleUserRound size={12} strokeWidth={1.8} />
    </span>
  );
}

export function ProjectSwitcherStrip({
  activeProjectId,
  activeContextName = "Personal",
  authSession,
  authSessionLoading = false,
  onAddProject,
  onOpenSettings,
  projects,
  readyProjectIds,
}: ProjectSwitcherStripProps) {
  const shouldInset = shouldInsetForWindowControls(detectPlatformHint(), isTauri());

  const handleMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !isTauri()) {
      return;
    }

    if ((event.target as Element).closest("a, button, input, textarea, select, [role='button']")) {
      return;
    }

    event.preventDefault();

    if (event.detail >= 2) {
      void getCurrentWindow().toggleMaximize();
    } else {
      void getCurrentWindow().startDragging();
    }
  }, []);

  return (
    <header
      className={[
        "flex h-9 shrink-0 select-none items-center gap-1.5 rounded-[18px] px-1 text-[var(--foreground)]",
        shouldInset ? "pl-20 pr-1" : "px-1",
      ].join(" ")}
      data-slot="project-switcher-strip"
      onMouseDown={handleMouseDown}
    >
      <Button
        aria-label={`Open ${activeContextName} context`}
        className="h-7 shrink-0 gap-1.5 rounded-[8px] bg-[color-mix(in_srgb,var(--surface),var(--foreground)_4%)] px-2 text-[11px] font-medium text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--surface),var(--foreground)_8%)]"
        data-slot="project-switcher-context"
        onClick={onOpenSettings}
        title={contextControlTitle(activeContextName, authSession, authSessionLoading)}
        variant="ghost"
      >
        <AuthSessionAvatar loading={authSessionLoading} session={authSession} />
        <span className="max-w-[8rem] truncate">{activeContextName}</span>
        <ChevronDown className="size-3.5 text-[var(--muted-foreground)]" strokeWidth={1.8} />
      </Button>
      <div
        aria-hidden="true"
        className="h-5 w-px shrink-0 bg-[color-mix(in_srgb,var(--border),transparent_12%)]"
      />
      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex min-w-max items-center gap-0.5 pr-0.5">
          {projects.map((project) => {
            const selected = project.id === activeProjectId;
            const responseReady = readyProjectIds?.has(project.id) ?? false;
            return (
              <Link
                key={project.id}
                aria-label={`Open project ${project.name}`}
                className={[
                  "relative inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-[8px] px-2 text-[12px] font-medium leading-none transition-colors",
                  responseReady ? "pr-5" : "",
                  selected
                    ? "bg-[color-mix(in_srgb,var(--surface),var(--foreground)_6%)] text-[var(--foreground)]"
                    : "bg-transparent text-[var(--muted-foreground)] hover:bg-[color-mix(in_srgb,var(--surface),var(--foreground)_3%)] hover:text-[var(--foreground)]",
                ].join(" ")}
                to={`/projects/${project.id}`}
                title={project.name}
              >
                {responseReady ? (
                  <ResponseReadyDot className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 scale-[0.85]" />
                ) : null}
                <span
                  className={[
                    "inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold uppercase",
                    selected
                      ? "bg-[color-mix(in_srgb,var(--foreground),transparent_86%)] text-[var(--foreground)]"
                      : "bg-[color-mix(in_srgb,var(--foreground),transparent_90%)] text-[var(--foreground)]",
                  ].join(" ")}
                >
                  {projectMonogram(project.name)}
                </span>
                <span className="truncate">{project.name}</span>
              </Link>
            );
          })}
          <Button
            aria-label="Add project"
            className="shrink-0"
            onClick={onAddProject}
            size="icon"
            variant="ghost"
          >
            <Plus size={14} strokeWidth={2} />
          </Button>
        </div>
      </div>
    </header>
  );
}
