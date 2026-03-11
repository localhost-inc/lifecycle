import * as React from "react";
import { cn } from "../lib/cn";

const LOGO_VIEW_BOX = "0 0 535 535";
const DEFAULT_LOGO_SIZE = 128;
const DEFAULT_DRAW_DURATION_MS = 1900;

const INFINITY_PIXEL_PATH =
  "M118.611 342.4V305.2H100V230.8H118.611V193.6H155.833V175H193.056V193.6H230.278V212.2H248.889V230.8H267.5V249.4H286.111V268H304.722V286.6H323.333V305.2H341.944V323.8H379.167V305.2H397.778V230.8H379.167V212.2H341.944V230.8H323.333V249.4H286.111V212.2H304.722V193.6H341.944V175H379.167V193.6H416.389V230.8H435V305.2H416.389V342.4H379.167V361H341.944V342.4H304.722V323.8H286.111V305.2H267.5V286.6H248.889V268H230.278V249.4H211.667V230.8H193.056V212.2H155.833V230.8H137.222V305.2H155.833V323.8H193.056V305.2H211.667V286.6H248.889V323.8H230.278V342.4H193.056V361H155.833V342.4H118.611Z";

const LEFT_LOOP_PATH = "M 267.5,268 C 267.5,190 118,190 118,268 C 118,346 267.5,346 267.5,268";
const RIGHT_LOOP_PATH = "M 267.5,268 C 267.5,190 416,190 416,268 C 416,346 267.5,346 267.5,268";

export interface LogoProps extends Omit<React.ComponentProps<"svg">, "children" | "viewBox"> {
  animate?: boolean;
  drawDurationMs?: number;
  drawTimingFunction?: React.CSSProperties["animationTimingFunction"];
  repeat?: boolean;
  size?: number | string;
}

function Logo({
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  animate = false,
  className,
  drawDurationMs = DEFAULT_DRAW_DURATION_MS,
  drawTimingFunction = "linear",
  height,
  repeat = false,
  size = DEFAULT_LOGO_SIZE,
  width,
  ...props
}: LogoProps) {
  const clipPathKey = React.useId().replaceAll(":", "");
  const leftClipPathId = `lifecycle-logo-left-${clipPathKey}`;
  const rightClipPathId = `lifecycle-logo-right-${clipPathKey}`;
  const pixelClipPathId = `lifecycle-logo-pixel-${clipPathKey}`;
  const animationDurationMs = Math.max(1, Math.round(drawDurationMs));
  const isDecorative = ariaLabel === undefined && ariaLabelledBy === undefined;

  if (!animate) {
    return (
      <svg
        aria-hidden={ariaHidden ?? (isDecorative ? true : undefined)}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(className)}
        data-slot="logo"
        fill="none"
        height={height ?? size}
        viewBox={LOGO_VIEW_BOX}
        width={width ?? size}
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d={INFINITY_PIXEL_PATH} fill="currentColor" />
      </svg>
    );
  }

  const animationStyle = {
    animationDuration: `${animationDurationMs}ms`,
    animationFillMode: "forwards",
    animationIterationCount: repeat ? "infinite" : 1,
    animationTimingFunction: drawTimingFunction,
  } satisfies React.CSSProperties;

  return (
    <svg
      aria-hidden={ariaHidden ?? (isDecorative ? true : undefined)}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(className)}
      data-slot="logo"
      fill="none"
      height={height ?? size}
      viewBox={LOGO_VIEW_BOX}
      width={width ?? size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <clipPath id={leftClipPathId}>
          <rect height="535" width="267.5" x="0" y="0" />
        </clipPath>
        <clipPath id={rightClipPathId}>
          <rect height="535" width="267.5" x="267.5" y="0" />
        </clipPath>
        <clipPath id={pixelClipPathId}>
          <path d={INFINITY_PIXEL_PATH} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${pixelClipPathId})`}>
        <g clipPath={`url(#${leftClipPathId})`}>
          <path
            d={LEFT_LOOP_PATH}
            data-lifecycle-logo-path="left"
            fill="none"
            pathLength={1}
            stroke="currentColor"
            strokeDasharray={1}
            strokeDashoffset={1}
            strokeLinecap="butt"
            strokeWidth={100}
            style={animationStyle}
          />
        </g>
        <g clipPath={`url(#${rightClipPathId})`}>
          <path
            d={RIGHT_LOOP_PATH}
            data-lifecycle-logo-path="right"
            fill="none"
            pathLength={1}
            stroke="currentColor"
            strokeDasharray={1}
            strokeDashoffset={1}
            strokeLinecap="butt"
            strokeWidth={100}
            style={animationStyle}
          />
        </g>
      </g>
    </svg>
  );
}

export { Logo };
