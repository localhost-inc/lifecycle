import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@lifecycle/ui";
import { FolderOpen } from "lucide-react";
import { usePrefersReducedMotion } from "../../../hooks/use-prefers-reduced-motion";
import "./welcome-screen.css";

const LIFECYCLE_TEXT = "lifecycle";
const TYPE_INTERVAL_MS = 140;
const SNAKE_DRAW_MS = 2200;
const PAUSE_MS = 1500;
const SETTLE_MS = 900;
const TYPING_DONE_PAUSE_MS = 600;

/**
 * logo     → snake draws big in center
 * pause    → hold, let the logo breathe
 * settle   → shrink + move up
 * typing   → typewriter types "lifecycle", cursor blinks throughout
 * reveal   → brief pause, then button fades in
 * complete → all visible, logo floats, cursor keeps blinking
 */
type AnimationPhase = "logo" | "pause" | "settle" | "typing" | "reveal" | "complete";

interface WelcomeScreenProps {
  onAddProject: () => void;
}

/** Pixel fill path from lifecycle-logo.svg */
const INFINITY_PIXEL_PATH =
  "M118.611 342.4V305.2H100V230.8H118.611V193.6H155.833V175H193.056V193.6H230.278V212.2H248.889V230.8H267.5V249.4H286.111V268H304.722V286.6H323.333V305.2H341.944V323.8H379.167V305.2H397.778V230.8H379.167V212.2H341.944V230.8H323.333V249.4H286.111V212.2H304.722V193.6H341.944V175H379.167V193.6H416.389V230.8H435V305.2H416.389V342.4H379.167V361H341.944V342.4H304.722V323.8H286.111V305.2H267.5V286.6H248.889V268H230.278V249.4H211.667V230.8H193.056V212.2H155.833V230.8H137.222V305.2H155.833V323.8H193.056V305.2H211.667V286.6H248.889V323.8H230.278V342.4H193.056V361H155.833V342.4H118.611Z";

/** Left loop: center → top-left → left → bottom-left → center */
const LEFT_LOOP_PATH = "M 267.5,268 C 267.5,190 118,190 118,268 C 118,346 267.5,346 267.5,268";

/** Right loop: center → top-right → right → bottom-right → center */
const RIGHT_LOOP_PATH = "M 267.5,268 C 267.5,190 416,190 416,268 C 416,346 267.5,346 267.5,268";

function InfinityLogo({
  className,
  animate = false,
  size = 128,
}: {
  className?: string;
  animate?: boolean;
  size?: number;
}) {
  const leftRef = useRef<SVGPathElement>(null);
  const rightRef = useRef<SVGPathElement>(null);
  const [leftLength, setLeftLength] = useState(0);
  const [rightLength, setRightLength] = useState(0);

  useLayoutEffect(() => {
    if (!animate) return;
    if (leftLength === 0 && leftRef.current) {
      setLeftLength(leftRef.current.getTotalLength());
    }
    if (rightLength === 0 && rightRef.current) {
      setRightLength(rightRef.current.getTotalLength());
    }
  }, [animate, leftLength, rightLength]);

  if (!animate) {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 535 535"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={INFINITY_PIXEL_PATH} fill="currentColor" />
      </svg>
    );
  }

  const measured = leftLength > 0 && rightLength > 0;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 535 535"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="welcome-clip-left">
          <rect x="0" y="0" width="267.5" height="535" />
        </clipPath>
        <clipPath id="welcome-clip-right">
          <rect x="267.5" y="0" width="267.5" height="535" />
        </clipPath>
        <clipPath id="welcome-clip-pixel">
          <path d={INFINITY_PIXEL_PATH} />
        </clipPath>
      </defs>
      {measured ? (
        <g clipPath="url(#welcome-clip-pixel)">
          <g clipPath="url(#welcome-clip-left)">
            <path
              d={LEFT_LOOP_PATH}
              stroke="currentColor"
              strokeWidth="100"
              strokeLinecap="butt"
              fill="none"
              className="welcome-snake-draw-left"
              style={{
                strokeDasharray: leftLength,
                strokeDashoffset: leftLength,
              }}
            />
          </g>
          <g clipPath="url(#welcome-clip-right)">
            <path
              d={RIGHT_LOOP_PATH}
              stroke="currentColor"
              strokeWidth="100"
              strokeLinecap="butt"
              fill="none"
              className="welcome-snake-draw-right"
              style={{
                strokeDasharray: rightLength,
                strokeDashoffset: rightLength,
              }}
            />
          </g>
        </g>
      ) : (
        <>
          <path
            ref={leftRef}
            d={LEFT_LOOP_PATH}
            stroke="transparent"
            strokeWidth="100"
            fill="none"
          />
          <path
            ref={rightRef}
            d={RIGHT_LOOP_PATH}
            stroke="transparent"
            strokeWidth="100"
            fill="none"
          />
        </>
      )}
    </svg>
  );
}

export function WelcomeScreen({ onAddProject }: WelcomeScreenProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [animKey, setAnimKey] = useState(0);
  const [phase, setPhase] = useState<AnimationPhase>(() =>
    prefersReducedMotion ? "complete" : "logo",
  );
  const [typedCount, setTypedCount] = useState(() =>
    prefersReducedMotion ? LIFECYCLE_TEXT.length : 0,
  );
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // logo → pause
  useEffect(() => {
    if (prefersReducedMotion) {
      setPhase("complete");
      setTypedCount(LIFECYCLE_TEXT.length);
      return;
    }
    if (phase !== "logo") return;
    const timer = setTimeout(() => {
      if (phaseRef.current === "logo") setPhase("pause");
    }, SNAKE_DRAW_MS);
    return () => clearTimeout(timer);
  }, [phase, prefersReducedMotion]);

  // pause → settle
  useEffect(() => {
    if (prefersReducedMotion || phase !== "pause") return;
    const timer = setTimeout(() => {
      if (phaseRef.current === "pause") setPhase("settle");
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [phase, prefersReducedMotion]);

  // settle → typing
  useEffect(() => {
    if (prefersReducedMotion || phase !== "settle") return;
    const timer = setTimeout(() => {
      if (phaseRef.current === "settle") setPhase("typing");
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [phase, prefersReducedMotion]);

  // typing → reveal (after all chars typed + pause)
  useEffect(() => {
    if (prefersReducedMotion || phase !== "typing") return;
    if (typedCount >= LIFECYCLE_TEXT.length) {
      const timer = setTimeout(() => {
        if (phaseRef.current === "typing") setPhase("reveal");
      }, TYPING_DONE_PAUSE_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setTypedCount((c) => c + 1);
    }, TYPE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [phase, prefersReducedMotion, typedCount]);

  const handleClick = useCallback(() => {
    onAddProject();
  }, [onAddProject]);

  const handleRestart = useCallback(() => {
    setPhase("logo");
    setTypedCount(0);
    setAnimKey((k) => k + 1);
  }, []);

  const isBigLogo = phase === "logo" || phase === "pause";
  const isSettling = phase === "settle";
  const pastSettle = phase === "typing" || phase === "reveal" || phase === "complete";
  const showFloat = pastSettle && !prefersReducedMotion;
  const showText = pastSettle;
  const showButton = phase === "reveal" || phase === "complete";

  return (
    <div
      data-tauri-drag-region
      className="flex h-full w-full select-none flex-col items-center justify-center bg-[var(--background)]"
    >
      {/* Logo — outer div scales, inner div floats */}
      <div data-tauri-drag-region>
        <div
          className={isSettling && !prefersReducedMotion ? "welcome-logo-settle" : undefined}
          style={
            (isSettling || pastSettle) && !prefersReducedMotion
              ? { transform: "scale(0.55)", marginBottom: -50 }
              : undefined
          }
        >
          <div className={showFloat ? "welcome-logo-float" : undefined}>
            <InfinityLogo
              key={animKey}
              className="text-[var(--foreground)]"
              animate={!prefersReducedMotion}
              size={220}
            />
          </div>
        </div>
      </div>

      {/* Typewriter text + persistent blinking cursor */}
      <div className="h-12 flex items-center" data-tauri-drag-region>
        {showText && (
          <span className="font-pixel text-4xl tracking-tight text-[var(--foreground)]">
            {LIFECYCLE_TEXT.slice(0, typedCount)}
            <span
              aria-hidden
              className="welcome-cursor-blink ml-1 inline-block h-[0.85em] w-[0.12em] translate-y-[0.1em] bg-[var(--foreground)]"
            />
          </span>
        )}
      </div>

      {/* CTA Button */}
      <div className="mt-6 h-10 flex items-center" data-tauri-drag-region>
        {showButton && (
          <div className={prefersReducedMotion ? undefined : "welcome-button-enter"}>
            <Button data-no-drag variant="secondary" onClick={handleClick}>
              <FolderOpen size={16} />
              Open project folder
            </Button>
          </div>
        )}
      </div>

      {/* Dev restart */}
      {import.meta.env.DEV && (
        <button
          data-no-drag
          type="button"
          onClick={handleRestart}
          className="fixed bottom-3 right-3 rounded px-2 py-1 text-xs text-[var(--muted-foreground)] opacity-40 hover:opacity-100 transition-opacity"
        >
          restart
        </button>
      )}
    </div>
  );
}
