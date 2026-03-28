import { Badge } from "@lifecycle/ui";
import type { ManifestStatus } from "@lifecycle/workspace";

const variants = {
  valid: "success",
  invalid: "destructive",
  missing: "muted",
} as const;

const labels = {
  valid: "Valid",
  invalid: "Invalid",
  missing: "No config",
} as const;

export function StatusBadge({ state }: { state: ManifestStatus["state"] }) {
  if (state === "missing") return null;

  return <Badge variant={variants[state]}>{labels[state]}</Badge>;
}
