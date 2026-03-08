import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(iso: string): string {
  return dayjs(iso).fromNow();
}

export function formatCompactRelativeTime(iso: string): string {
  if (!iso) return "";

  const diff = Date.now() - new Date(iso).getTime();

  if (diff < 0) return dayjs(iso).format("MMM D");
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d`;

  return dayjs(iso).format("MMM D");
}
