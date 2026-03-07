const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const shortMonth = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();

  if (diff < 0) {
    // future date — show absolute
    const d = new Date(iso);
    return `${shortMonth[d.getMonth()]} ${d.getDate()}`;
  }

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;

  const d = new Date(iso);
  return `${shortMonth[d.getMonth()]} ${d.getDate()}`;
}

export function formatCompactRelativeTime(iso: string): string {
  if (!iso) return "";

  const diff = Date.now() - new Date(iso).getTime();

  if (diff < 0) {
    const d = new Date(iso);
    return `${shortMonth[d.getMonth()]} ${d.getDate()}`;
  }

  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;

  const d = new Date(iso);
  return `${shortMonth[d.getMonth()]} ${d.getDate()}`;
}
