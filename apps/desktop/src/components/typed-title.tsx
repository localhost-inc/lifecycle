import { cn } from "@lifecycle/ui";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const TYPE_MIN_INTERVAL_MS = 18;
const TYPE_MAX_INTERVAL_MS = 42;
const TYPE_TOTAL_DURATION_MS = 420;

function titleTypeInterval(text: string): number {
  const boundedLength = Math.max(text.length, 1);
  return Math.min(
    TYPE_MAX_INTERVAL_MS,
    Math.max(TYPE_MIN_INTERVAL_MS, Math.floor(TYPE_TOTAL_DURATION_MS / boundedLength)),
  );
}

interface TypedTitleProps {
  className?: string;
  text: string;
}

export function TypedTitle({ className, text }: TypedTitleProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [displayText, setDisplayText] = useState(text);
  const [animating, setAnimating] = useState(false);
  const previousTextRef = useRef(text);

  useEffect(() => {
    if (text === previousTextRef.current) {
      return;
    }

    previousTextRef.current = text;

    if (prefersReducedMotion || text.length <= 1) {
      setAnimating(false);
      setDisplayText(text);
      return;
    }

    let index = 0;
    const intervalMs = titleTypeInterval(text);
    setAnimating(true);
    setDisplayText("");

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      index += 1;
      setDisplayText(text.slice(0, index));
      if (index >= text.length) {
        setAnimating(false);
        return;
      }

      timeoutId = setTimeout(tick, intervalMs);
    };

    timeoutId = setTimeout(tick, intervalMs);

    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [prefersReducedMotion, text]);

  return (
    <span className={cn("inline-flex min-w-0 items-center", className)}>
      <span className="truncate">{displayText}</span>
      {animating ? (
        <span
          aria-hidden
          className="lifecycle-motion-soft-pulse ml-0.5 inline-block h-[0.95em] w-px rounded-full bg-current opacity-60"
        />
      ) : null}
    </span>
  );
}
