import { formatCompactRelativeTime } from "../../../lib/format";
import type { WorkspaceActivityItem } from "../hooks";

interface WorkspaceActivityFeedProps {
  items: WorkspaceActivityItem[];
}

function toneClassName(tone: WorkspaceActivityItem["tone"]): string {
  switch (tone) {
    case "success":
      return "bg-emerald-400";
    case "warning":
      return "bg-amber-400";
    case "danger":
      return "bg-[var(--destructive)]";
    default:
      return "bg-[var(--muted-foreground)]/35";
  }
}

export function WorkspaceActivityFeed({ items }: WorkspaceActivityFeedProps) {
  if (items.length === 0) {
    return <p className="py-3 text-xs text-[var(--muted-foreground)]/60">No activity yet.</p>;
  }

  return (
    <ul>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <li
            key={item.id}
            className={`py-3 ${!isLast ? "border-b border-[var(--border)]/40" : ""}`}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneClassName(item.tone)}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <p className="min-w-0 flex-1 text-sm font-medium text-[var(--foreground)]">
                    {item.title}
                  </p>
                  <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                    {formatCompactRelativeTime(item.occurredAt)}
                  </span>
                </div>
                {item.detail ? (
                  <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                    {item.detail}
                  </p>
                ) : null}
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]/45">
                  {item.kind}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
