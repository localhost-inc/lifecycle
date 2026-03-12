import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

type ScrollFadeDirection = "left" | "right" | "both" | "top" | "bottom" | "vertical";

interface ScrollFadeProps extends ComponentProps<"div"> {
  /** Which edge(s) get the fade gradient. Default: "right" */
  direction?: ScrollFadeDirection;
  /** Size of the fade in px. Default: 32 */
  size?: number;
}

function ScrollFade({
  children,
  className,
  direction = "right",
  size = 32,
  style,
  ...props
}: ScrollFadeProps) {
  const showLeft = direction === "left" || direction === "both";
  const showRight = direction === "right" || direction === "both";
  const showTop = direction === "top" || direction === "vertical";
  const showBottom = direction === "bottom" || direction === "vertical";

  return (
    <div className={cn("relative", className)} style={style} {...props}>
      {showTop && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] bg-gradient-to-b from-[var(--background)] to-transparent"
          style={{ height: size }}
        />
      )}
      {showLeft && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-[1] bg-gradient-to-r from-[var(--background)] to-transparent"
          style={{ width: size }}
        />
      )}
      {children}
      {showRight && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] bg-gradient-to-l from-[var(--background)] to-transparent"
          style={{ width: size }}
        />
      )}
      {showBottom && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-[var(--background)] to-transparent"
          style={{ height: size }}
        />
      )}
    </div>
  );
}

export { ScrollFade, type ScrollFadeProps, type ScrollFadeDirection };
