import type { ManifestStatus } from "../api/projects";

const styles = {
  valid: "bg-emerald-100 text-emerald-700",
  invalid: "bg-red-100 text-red-700",
  missing: "bg-stone-100 text-stone-500",
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
