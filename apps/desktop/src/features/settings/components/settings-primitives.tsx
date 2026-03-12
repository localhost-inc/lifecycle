import { forwardRef, type ReactNode } from "react";

interface SettingsSectionProps {
  id?: string;
  label: string;
  description?: string;
  children?: ReactNode;
}

export const SettingsSection = forwardRef<HTMLElement, SettingsSectionProps>(
  function SettingsSection({ id, label, description, children }, ref) {
    return (
      <section
        className="mt-10 scroll-mt-8 border-t border-[var(--border)] pt-10"
        id={id}
        ref={ref}
      >
        <h2 className="app-panel-title text-[var(--muted-foreground)]">{label}</h2>
        {description && (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
        <div className="mt-3">{children}</div>
      </section>
    );
  },
);

interface SettingsRowProps {
  label: string;
  description?: string;
  children?: ReactNode;
}

export function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="grid gap-3 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
      <div>
        <h3 className="text-sm font-medium text-[var(--foreground)]">{label}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 md:justify-self-end">{children}</div>
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
    <div className="py-2">
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
