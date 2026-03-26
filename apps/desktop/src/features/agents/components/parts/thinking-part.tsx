import { Shimmer } from "@lifecycle/ui";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ThinkingPart({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(false);
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isStreaming) {
      startRef.current = Date.now();
      const interval = setInterval(() => {
        setElapsed(Math.round((Date.now() - startRef.current) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
    setElapsed(Math.round((Date.now() - startRef.current) / 1000));
  }, [isStreaming]);

  const label = isStreaming
    ? `thinking${elapsed > 0 ? ` ${elapsed}s` : ""}`
    : `thought for ${Math.max(elapsed, 1)}s`;

  return (
    <div className="my-1">
      <button
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <ChevronRight
          className={["size-3 transition-transform", open ? "rotate-90" : ""].join(" ")}
        />
        {isStreaming ? (
          <Shimmer as="span" className="text-[11px] uppercase tracking-[0.08em]" duration={1.5}>
            {label}
          </Shimmer>
        ) : (
          <span>{label}</span>
        )}
      </button>
      {open ? (
        <pre className="mt-1 whitespace-pre-wrap break-words border-l-2 border-[var(--border)] pl-3 text-[12px] leading-5 text-[var(--muted-foreground)]">
          {text}
        </pre>
      ) : null}
    </div>
  );
}
