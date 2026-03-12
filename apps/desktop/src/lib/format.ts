import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * SQLite `datetime('now')` returns UTC timestamps without a timezone
 * suffix (e.g. "2026-03-12 18:55:00"). JavaScript's `new Date()` parses
 * bare datetime strings as local time, which shifts the value by the
 * local UTC offset. Appending "Z" forces UTC interpretation.
 */
function parseUtcTimestamp(value: string): number {
  const normalized = value.includes("T") || value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).getTime();
}

export function formatRelativeTime(iso: string): string {
  return dayjs(parseUtcTimestamp(iso)).fromNow();
}

export function formatCompactRelativeTime(iso: string): string {
  if (!iso) return "";

  const diff = Date.now() - parseUtcTimestamp(iso);

  if (diff < 0) return "Now";
  if (diff < MINUTE) return "Now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d`;

  return dayjs(parseUtcTimestamp(iso)).format("MMM D");
}
