import type { ManifestStatus } from "../api/projects";

const styles = {
  valid: "bg-emerald-500/10 text-emerald-400",
  invalid: "bg-red-500/10 text-red-400",
  missing: "bg-[var(--muted)] text-[var(--muted-foreground)]",
} as const;

const labels = {
  valid: "Valid",
  invalid: "Invalid",
  missing: "No config",
} as const;

export function StatusBadge({ state }: { state: ManifestStatus["state"] }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${styles[state]}`}
    >
      {labels[state]}
    </span>
  );
}
