import { useEffect, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

let maxSeenHistoryIndex = 0;

function readHistoryIndex(): number {
  if (typeof window === "undefined") return 0;
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : 0;
}

export function useHistoryAvailability() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const [historyIndex, setHistoryIndex] = useState(() => readHistoryIndex());

  useEffect(() => {
    const index = readHistoryIndex();

    if (navigationType === "PUSH") {
      maxSeenHistoryIndex = index;
    } else if (index > maxSeenHistoryIndex) {
      maxSeenHistoryIndex = index;
    }

    setHistoryIndex(index);
  }, [location.key, navigationType]);

  return {
    canGoBack: historyIndex > 0,
    canGoForward: historyIndex < maxSeenHistoryIndex,
  };
}
