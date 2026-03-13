import { createContext, useContext } from "react";
import type { CommandPaletteMode } from "./types";

export interface CommandPaletteContextValue {
  canOpenFiles: boolean;
  isOpen: boolean;
  mode: CommandPaletteMode;
  open: (mode?: CommandPaletteMode) => void;
  close: () => void;
  toggle: (mode?: CommandPaletteMode) => void;
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
  const value = useContext(CommandPaletteContext);
  if (!value) {
    throw new Error("useCommandPalette must be used within a CommandPaletteProvider");
  }
  return value;
}
