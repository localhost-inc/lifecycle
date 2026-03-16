import type { ReactNode } from "react";

export function HarnessSettingsCardShell({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-medium text-[var(--foreground)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
