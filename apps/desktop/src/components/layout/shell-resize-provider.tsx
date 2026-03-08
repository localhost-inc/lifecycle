import { createContext, useContext, useEffect, type ReactNode } from "react";

const ShellResizeContext = createContext(false);
const shellResizeListeners = new Set<(resizing: boolean) => void>();
let currentShellResizeState = false;

interface ShellResizeProviderProps {
  children: ReactNode;
  resizing: boolean;
}

export function ShellResizeProvider({ children, resizing }: ShellResizeProviderProps) {
  useEffect(() => {
    currentShellResizeState = resizing;
  }, [resizing]);

  return <ShellResizeContext.Provider value={resizing}>{children}</ShellResizeContext.Provider>;
}

export function useShellResizeInProgress(): boolean {
  return useContext(ShellResizeContext);
}

export function notifyShellResizeListeners(resizing: boolean): void {
  currentShellResizeState = resizing;
  for (const listener of shellResizeListeners) {
    listener(resizing);
  }
}

export function subscribeToShellResize(listener: (resizing: boolean) => void): () => void {
  shellResizeListeners.add(listener);
  listener(currentShellResizeState);
  return () => {
    shellResizeListeners.delete(listener);
  };
}
