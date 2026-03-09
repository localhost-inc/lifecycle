import type { GitLogEntry } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { History } from "lucide-react";
import { useState } from "react";

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

function authorHue(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

// --- sub-components ---

function avatarUrl(email: string): string | null {
  if (!email) return null;
  // GitHub noreply emails: {id}+{username}@users.noreply.github.com
  const noreply = email.match(/^(\d+\+)?(.+)@users\.noreply\.github\.com$/);
  if (noreply) return `https://github.com/${noreply[2]}.png?size=40`;
  // For other emails, try GitHub's email-based avatar lookup
  return `https://avatars.githubusercontent.com/u/e?email=${encodeURIComponent(email)}&s=40`;
}

function AuthorAvatar({ name, email }: { name: string; email: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = avatarUrl(email);
  const hue = authorHue(name);
  const letter = name.charAt(0).toUpperCase();

  if (url && !imgFailed) {
    return (
      <img
        src={url}
        alt={name}
        className="h-4 w-4 shrink-0 rounded-full"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold leading-none text-white"
      style={{ backgroundColor: `hsl(${hue}, 50%, 45%)` }}
    >
      {letter}
    </div>
  );
}

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
      <AuthorAvatar name={entry.author} email={entry.email} />
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
    return <p className="text-xs text-[var(--muted-foreground)]">Loading history...</p>;
  }

  if (error) {
    return <p className="text-xs text-red-400">Failed to load history: {String(error)}</p>;
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
          <div className="sticky top-0 z-10 px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            {group.label}
          </div>
          {group.entries.map((entry) => (
            <CommitRow key={entry.sha} entry={entry} onOpenCommit={onOpenCommit} />
          ))}
        </div>
      ))}
    </div>
  );
}
