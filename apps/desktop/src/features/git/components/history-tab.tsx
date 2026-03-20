import type { GitLogEntry } from "@lifecycle/contracts";
import { EmptyState, Loading } from "@lifecycle/ui";
import { History } from "lucide-react";
import { GithubAvatar } from "@/features/git/components/github-avatar";

interface HistoryTabProps {
  error: unknown;
  isLoading: boolean;
  entries: GitLogEntry[];
  onOpenCommit: (entry: GitLogEntry) => void;
}

// --- helpers (local) ---

const shortMonth = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function getDateGroupLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = startOfToday.getTime() - startOfDay.getTime();

  if (diff === 0) return "Today";
  if (diff === 86_400_000) return "Yesterday";

  if (date.getFullYear() === now.getFullYear()) {
    return `${shortMonth[date.getMonth()]} ${date.getDate()}`;
  }
  return `${shortMonth[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function groupEntriesByDate(
  entries: GitLogEntry[],
): Array<{ label: string; entries: GitLogEntry[] }> {
  const groups: Array<{ label: string; entries: GitLogEntry[] }> = [];
  for (const entry of entries) {
    const label = getDateGroupLabel(entry.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.entries.push(entry);
    } else {
      groups.push({ label, entries: [entry] });
    }
  }
  return groups;
}

function formatShortAge(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks}w`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

// --- sub-components ---

function CommitRow({
  entry,
  onOpenCommit,
}: {
  entry: GitLogEntry;
  onOpenCommit: (entry: GitLogEntry) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenCommit(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenCommit(entry);
        }
      }}
      className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 transition hover:bg-[var(--surface-hover)]"
      title={`Open diff for ${entry.shortSha}`}
    >
      <GithubAvatar name={entry.author} email={entry.email} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1 text-xs text-[var(--muted-foreground)]">
          <span className="truncate">{entry.author}</span>
          <span className="ml-auto shrink-0">{formatShortAge(entry.timestamp)}</span>
        </div>
        <p className="line-clamp-2 text-[13px] leading-snug text-[var(--foreground)]">
          {entry.message}
        </p>
      </div>
    </div>
  );
}

// --- main component ---

export function HistoryTab({ error, isLoading, entries, onOpenCommit }: HistoryTabProps) {
  if (isLoading && entries.length === 0) {
    return <Loading message="Loading history..." />;
  }

  if (error) {
    return (
      <p className="text-xs text-[var(--destructive)]">Failed to load history: {String(error)}</p>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        description="Commits will appear here once you start committing."
        icon={<History />}
        size="sm"
        title="No commits yet"
      />
    );
  }

  const groups = groupEntriesByDate(entries);

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="sticky top-0 z-10 flex justify-center px-2 py-1.5">
            <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              {group.label}
            </span>
          </div>
          {group.entries.map((entry) => (
            <CommitRow key={entry.sha} entry={entry} onOpenCommit={onOpenCommit} />
          ))}
        </div>
      ))}
    </div>
  );
}
