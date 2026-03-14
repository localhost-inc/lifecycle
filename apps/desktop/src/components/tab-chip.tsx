import { X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

interface TabChipProps {
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
    "relative -mb-px flex h-full shrink-0 items-center gap-2 px-3 text-sm transition-colors";
  const activeClasses = active
    ? "z-10 border-x first:border-l-0 border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] after:absolute after:-bottom-px after:inset-x-0 after:h-px after:bg-[var(--background)]"
    : "bg-[var(--panel)] text-[var(--muted-foreground)] after:absolute after:inset-y-2 after:right-0 after:w-px after:bg-[var(--border)] last:after:hidden hover:bg-[color-mix(in_oklab,var(--panel),var(--foreground)_2%)] hover:text-[var(--foreground)]";
  const fontClass = active ? "font-semibold" : "font-medium";

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
      {indicator}
      {leading ? (
        <span aria-hidden="true" className="shrink-0 text-[var(--muted-foreground)]">
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
