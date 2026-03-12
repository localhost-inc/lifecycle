import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { Logo } from "./logo";

const DEFAULT_DELAY_MS = 150;

interface LoadingProps {
  /** Optional message shown below the spinner */
  message?: string;
  /** Delay in ms before showing the loader. Prevents flicker for fast loads. @default 150 */
  delay?: number;
  className?: string;
}

function Loading({ message, delay = DEFAULT_DELAY_MS, className }: LoadingProps) {
  const [visible, setVisible] = useState(delay <= 0);

  useEffect(() => {
    if (delay <= 0) return;
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;

  return (
    <div
      aria-live="polite"
      className={cn("flex flex-1 items-center justify-center py-8", className)}
      role="status"
    >
      <div className="flex flex-col items-center gap-1.5 text-center">
        <Logo animate className="text-[var(--muted-foreground)] opacity-70" repeat size={24} />
        {message && <p className="text-xs text-[var(--muted-foreground)]">{message}</p>}
      </div>
    </div>
  );
}

export { Loading, type LoadingProps };
