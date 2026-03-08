import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

type ScrollFadeDirection = "left" | "right" | "both";

interface ScrollFadeProps extends ComponentProps<"div"> {
  /** Which edge(s) get the fade gradient. Default: "right" */
  direction?: ScrollFadeDirection;
  /** Width of the fade in px. Default: 32 */
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

  return (
    <div
      className={cn("relative", className)}
      style={style}
      {...props}
    >
      {showLeft && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 bg-gradient-to-r from-[var(--background)] to-transparent"
          style={{ width: size }}
        />
      )}
      {children}
      {showRight && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 bg-red-500"
          style={{ width: size }}
        />
      )}
    </div>
  );
}

export { ScrollFade, type ScrollFadeProps, type ScrollFadeDirection };
