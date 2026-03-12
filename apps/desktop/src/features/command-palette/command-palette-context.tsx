import { createContext, useContext } from "react";

export interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
  const value = useContext(CommandPaletteContext);
  if (!value) {
    throw new Error("useCommandPalette must be used within a CommandPaletteProvider");
  }
  return value;
}
