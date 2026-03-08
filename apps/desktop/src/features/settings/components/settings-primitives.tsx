import type { ReactNode } from "react";

interface SettingsPageProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function SettingsPage({ title, description, children }: SettingsPageProps) {
  return (
    <div className="flex-1 overflow-y-auto px-12 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
        {children}
      </div>
    </div>
  );
}

interface SettingsSectionProps {
  label: string;
  children?: ReactNode;
}

export function SettingsSection({ label, children }: SettingsSectionProps) {
  return (
    <section className="mt-10">
      <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </h2>
      <div className="mt-3 border-t border-[var(--border)]">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  children?: ReactNode;
}

export function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[var(--border)] py-4 last:border-b-0">
      <div>
        <h3 className="text-sm font-medium text-[var(--foreground)]">{label}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

interface SettingsFieldRowProps {
  label: string;
  htmlFor?: string;
  description?: string;
  children?: ReactNode;
}

export function SettingsFieldRow({ label, htmlFor, description, children }: SettingsFieldRowProps) {
  return (
    <div className="border-b border-[var(--border)] py-4 last:border-b-0">
      <label
        className="text-sm font-medium text-[var(--foreground)]"
        {...(htmlFor ? { htmlFor } : {})}
      >
        {label}
      </label>
      {description && (
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{description}</p>
      )}
      <div className="mt-2">{children}</div>
    </div>
  );
}
