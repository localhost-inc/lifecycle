import type { GitLogEntry } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { History } from "lucide-react";
import { useCallback, useState } from "react";
import { formatRelativeTime } from "../../../lib/format";

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
        className="h-5 w-5 shrink-0 rounded-full"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none text-white"
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
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(entry.sha);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [entry.sha]);

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
        <p className="line-clamp-2 text-[13px] leading-snug text-[var(--foreground)]">
          {entry.message}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
          {entry.author}
          {" · "}
          {formatRelativeTime(entry.timestamp)}
          {" · "}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleCopy();
            }}
            className="rounded px-1 font-mono transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            title={entry.sha}
          >
            {copied ? "Copied!" : entry.shortSha}
          </button>
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
