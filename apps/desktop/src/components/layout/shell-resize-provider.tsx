import { createContext, useContext, type ReactNode } from "react";

const ShellResizeContext = createContext(false);

interface ShellResizeProviderProps {
  children: ReactNode;
  resizing: boolean;
}

export function ShellResizeProvider({ children, resizing }: ShellResizeProviderProps) {
  return <ShellResizeContext.Provider value={resizing}>{children}</ShellResizeContext.Provider>;
}

export function useShellResizeInProgress(): boolean {
  return useContext(ShellResizeContext);
}
