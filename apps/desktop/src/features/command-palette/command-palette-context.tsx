import { createContext, useContext } from "react";
import type { CommandPaletteMode } from "@/features/command-palette/types";

export interface CommandPaletteContextValue {
  canOpenExplorer: boolean;
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
