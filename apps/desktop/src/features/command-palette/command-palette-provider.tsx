import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { isMacPlatform } from "../../app/app-hotkeys";
import { CommandPaletteContext, type CommandPaletteContextValue } from "./command-palette-context";
import { CommandPalette } from "./command-palette";
import { useCommandPaletteCommands } from "./use-command-palette-commands";

interface CommandPaletteProviderProps {
  children: ReactNode;
}

export function CommandPaletteProvider({ children }: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const commands = useCommandPaletteCommands();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const mac = isMacPlatform();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const isK = event.key === "k" || event.code === "KeyK";
      if (!isK || event.shiftKey || event.altKey) return;

      const modifier = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!modifier) return;

      event.preventDefault();
      setIsOpen((current) => !current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ isOpen, open, close }),
    [isOpen, open, close],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette commands={commands} isOpen={isOpen} onClose={close} />
    </CommandPaletteContext.Provider>
  );
}
