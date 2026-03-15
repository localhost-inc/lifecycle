import { X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

interface TabChipProps {
  activeSurface?: "background" | "card" | "surface";
  active: boolean;
  children?: ReactNode;
  className?: string;
  closable?: boolean;
  id?: string;
  label: string;
  leading?: ReactNode;
  onClick?: () => void;
  onClose?: () => void;
  style?: CSSProperties;
  tabIndex?: number;
  title?: string;
  onDoubleClick?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  refCallback?: (el: HTMLDivElement | null) => void;
  ariaControls?: string;
  ariaSelected?: boolean;
  role?: string;
  dataAttributes?: Record<string, string>;
  indicator?: ReactNode;
}

export function TabChip({
  activeSurface = "surface",
  active,
  children,
  className,
  closable = true,
  id,
  label,
  leading,
  onClick,
  onClose,
  style,
  tabIndex,
  title,
  onDoubleClick,
  onKeyDown,
  onPointerDown,
  refCallback,
  ariaControls,
  ariaSelected,
  role,
  dataAttributes,
  indicator,
}: TabChipProps) {
  const baseClasses =
    "relative flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r border-[var(--border)] px-3 text-[13px] transition-colors";
  const activeSurfaceClass =
    activeSurface === "card"
      ? "bg-[var(--card)]"
      : activeSurface === "surface"
        ? "bg-[var(--surface)]"
        : "bg-[var(--background)]";
  const activeClasses = active
    ? `${activeSurfaceClass} text-[var(--foreground)]`
    : "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]";
  const fontClass = active ? "font-medium" : "font-normal";

  const dataProps: Record<string, string> = {};
  if (dataAttributes) {
    for (const [key, value] of Object.entries(dataAttributes)) {
      dataProps[`data-${key}`] = value;
    }
  }

  return (
    <div
      ref={refCallback}
      id={id}
      aria-controls={ariaControls}
      aria-selected={ariaSelected}
      className={[baseClasses, activeClasses, className].filter(Boolean).join(" ")}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      role={role}
      style={style}
      tabIndex={tabIndex}
      title={title}
      {...dataProps}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--accent)]"
        />
      ) : null}
      {indicator}
      {leading ? (
        <span
          aria-hidden="true"
          className={`inline-flex shrink-0 items-center ${active ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}
        >
          {leading}
        </span>
      ) : null}
      {children ?? <span className={`min-w-0 truncate leading-none ${fontClass}`}>{label}</span>}
      {closable && onClose ? (
        <button
          aria-label={`Close ${label}`}
          className="flex size-4 items-center justify-center rounded-[4px] transition-colors hover:bg-[var(--surface-hover)]"
          data-tab-action="close"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
