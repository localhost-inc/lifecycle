import { Separator } from "@lifecycle/ui";
import type { ReactNode } from "react";

interface EnvironmentSectionProps {
  children: ReactNode;
  icon?: ReactNode;
  title: string;
}

export function EnvironmentSection({ children, icon, title }: EnvironmentSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3 px-1">
        <div className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          {icon}
          <span>{title}</span>
        </div>
        <Separator className="flex-1" />
      </div>
      {children}
    </section>
  );
}
