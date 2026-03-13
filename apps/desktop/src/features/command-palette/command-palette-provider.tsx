import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CommandPaletteContext, type CommandPaletteContextValue } from "./command-palette-context";
import { CommandPalette } from "./command-palette";
import { useCommandPaletteCommands } from "./use-command-palette-commands";
import { useCommandPaletteFiles } from "./use-command-palette-files";
import type { CommandPaletteMode } from "./types";

interface CommandPaletteProviderProps {
  children: ReactNode;
  onForkWorkspace?: () => void;
}

export function CommandPaletteProvider({ children, onForkWorkspace }: CommandPaletteProviderProps) {
  const [state, setState] = useState<{ isOpen: boolean; mode: CommandPaletteMode }>({
    isOpen: false,
    mode: "commands",
  });
  const files = useCommandPaletteFiles();
  const open = useCallback(
    (mode: CommandPaletteMode = "commands") => {
      if (mode === "files" && !files.isAvailable) {
        return;
      }

      setState({ isOpen: true, mode });
    },
    [files.isAvailable],
  );
  const close = useCallback(() => {
    setState((current) => ({ ...current, isOpen: false }));
  }, []);
  const toggle = useCallback(
    (mode: CommandPaletteMode = "commands") => {
      if (mode === "files" && !files.isAvailable) {
        return;
      }

      setState((current) =>
        current.isOpen && current.mode === mode
          ? { ...current, isOpen: false }
          : { isOpen: true, mode },
      );
    },
    [files.isAvailable],
  );
  const commands = useCommandPaletteCommands({
    onForkWorkspace,
    onOpenFiles: files.isAvailable ? () => open("files") : undefined,
  });

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      canOpenFiles: files.isAvailable,
      isOpen: state.isOpen,
      mode: state.mode,
      open,
      close,
      toggle,
    }),
    [close, files.isAvailable, open, state.isOpen, state.mode, toggle],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        commands={commands}
        fileError={files.error}
        fileItems={files.items}
        fileLoading={files.isLoading}
        isOpen={state.isOpen}
        mode={state.mode}
        onClose={close}
      />
    </CommandPaletteContext.Provider>
  );
}
