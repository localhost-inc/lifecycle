import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { CommandPaletteContext, type CommandPaletteContextValue } from "@/features/command-palette/command-palette-context";
import { CommandPalette } from "@/features/command-palette/command-palette";
import { useCommandPaletteCommands } from "@/features/command-palette/use-command-palette-commands";
import { useCommandPaletteFiles } from "@/features/command-palette/use-command-palette-files";
import type { CommandPaletteMode } from "@/features/command-palette/types";

interface CommandPaletteProviderProps {
  children: ReactNode;
  onForkWorkspace?: () => void;
  projects: ProjectRecord[];
  workspacesByProjectId: Record<string, WorkspaceRecord[]>;
}

export function CommandPaletteProvider({
  children,
  onForkWorkspace,
  projects,
  workspacesByProjectId,
}: CommandPaletteProviderProps) {
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
    projects,
    workspacesByProjectId,
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
