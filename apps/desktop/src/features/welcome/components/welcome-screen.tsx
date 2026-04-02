import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Logo } from "@lifecycle/ui";
import { FolderOpen } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import "@/features/welcome/components/welcome-screen.css";

const LIFECYCLE_TEXT = "lifecycle";
const TYPE_INTERVAL_MS = 140;
const SNAKE_DRAW_MS = 1900;
const SNAKE_DRAW_TIMING = "cubic-bezier(0.55, 0.085, 0.68, 0.53)";
const PAUSE_MS = 1200;
const SWELL_MS = 700;
const SETTLE_MS = 1000;
const TYPING_DONE_PAUSE_MS = 600;

/**
 * logo     → snake draws big in center
 * pause    → hold, let the logo breathe
 * swell    → ease into a slight overshoot
 * settle   → collapse into the anchored smaller logo
 * typing   → typewriter types "lifecycle", cursor blinks throughout
 * reveal   → brief pause, then button fades in
 * complete → all visible, logo floats, cursor keeps blinking
 */
type AnimationPhase = "logo" | "pause" | "swell" | "settle" | "typing" | "reveal" | "complete";

interface WelcomeScreenProps {
  onAddRepository: () => void;
}

export function WelcomeScreen({ onAddRepository }: WelcomeScreenProps) {
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

  // pause → swell
  useEffect(() => {
    if (prefersReducedMotion || phase !== "pause") return;
    const timer = setTimeout(() => {
      if (phaseRef.current === "pause") setPhase("swell");
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [phase, prefersReducedMotion]);

  // swell → settle
  useEffect(() => {
    if (prefersReducedMotion || phase !== "swell") return;
    const timer = setTimeout(() => {
      if (phaseRef.current === "swell") setPhase("settle");
    }, SWELL_MS);
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
    onAddRepository();
  }, [onAddRepository]);

  const handleRestart = useCallback(() => {
    setPhase("logo");
    setTypedCount(0);
    setAnimKey((k) => k + 1);
  }, []);

  const isSwelling = phase === "swell";
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
          className={
            !prefersReducedMotion
              ? isSwelling
                ? "welcome-logo-swell"
                : isSettling
                  ? "welcome-logo-settle"
                  : undefined
              : undefined
          }
          style={
            (isSettling || pastSettle) && !prefersReducedMotion
              ? { transform: "scale(0.58)", marginBottom: -42 }
              : undefined
          }
        >
          <div className={showFloat ? "welcome-logo-float" : undefined}>
            <Logo
              key={animKey}
              animate={!prefersReducedMotion}
              className="text-[var(--foreground)]"
              drawDurationMs={SNAKE_DRAW_MS}
              drawTimingFunction={SNAKE_DRAW_TIMING}
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
            <Button data-no-drag onClick={handleClick}>
              <FolderOpen size={16} />
              Open repository folder
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
