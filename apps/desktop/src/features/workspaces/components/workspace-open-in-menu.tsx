import { cn } from "@lifecycle/ui";
import type { OpenInAppId } from "../api";
import type { OpenInTarget } from "../lib/open-in-targets";
import { OpenInAppIcon } from "./open-in-app-icon";

interface WorkspaceOpenInMenuProps {
  availableTargets: readonly OpenInTarget[];
  defaultTargetId: OpenInAppId;
  launchError: string | null;
  launchingTarget: OpenInAppId | null;
  onOpenIn: (appId: OpenInAppId) => void;
}

export function WorkspaceOpenInMenu({
  availableTargets,
  defaultTargetId,
  launchError,
  launchingTarget,
  onOpenIn,
}: WorkspaceOpenInMenuProps) {
  return (
    <>
      <div className="px-2 pb-2 pt-1 text-[14px] font-medium text-[var(--muted-foreground)]">
        Open in
      </div>

      {launchError && (
        <div
          className="mx-2 mb-2 rounded-2xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/8 px-3 py-2 text-[12px] text-[var(--destructive)]"
          role="alert"
        >
          {launchError}
        </div>
      )}

      <div className="space-y-0.5">
        {availableTargets.map((target) => (
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left text-[14px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-60",
              target.id === defaultTargetId && "bg-[var(--surface-selected)]",
            )}
            disabled={launchingTarget !== null}
            key={target.id}
            onClick={() => onOpenIn(target.id)}
            type="button"
          >
            <OpenInAppIcon appId={target.id} iconDataUrl={target.iconDataUrl} />
            <span>{target.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
