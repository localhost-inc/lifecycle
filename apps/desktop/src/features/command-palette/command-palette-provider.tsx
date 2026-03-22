import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { CommandPaletteContext, type CommandPaletteContextValue } from "@/features/command-palette/command-palette-context";
import { CommandPalette } from "@/features/command-palette/command-palette";
import { useCommandPaletteCommands } from "@/features/command-palette/use-command-palette-commands";
import { useCommandPaletteExplorer } from "@/features/command-palette/use-command-palette-explorer";
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
  const explorer = useCommandPaletteExplorer();
  const open = useCallback(
    (mode: CommandPaletteMode = "commands") => {
      if (mode === "explorer" && !explorer.isAvailable) {
        return;
      }

      setState({ isOpen: true, mode });
    },
    [explorer.isAvailable],
  );
  const close = useCallback(() => {
    setState((current) => ({ ...current, isOpen: false }));
  }, []);
  const toggle = useCallback(
    (mode: CommandPaletteMode = "commands") => {
      if (mode === "explorer" && !explorer.isAvailable) {
        return;
      }

      setState((current) =>
        current.isOpen && current.mode === mode
          ? { ...current, isOpen: false }
          : { isOpen: true, mode },
      );
    },
    [explorer.isAvailable],
  );
  const commands = useCommandPaletteCommands({
    onForkWorkspace,
    onOpenExplorer: explorer.isAvailable ? () => open("explorer") : undefined,
    projects,
    workspacesByProjectId,
  });

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      canOpenExplorer: explorer.isAvailable,
      isOpen: state.isOpen,
      mode: state.mode,
      open,
      close,
      toggle,
    }),
    [close, explorer.isAvailable, open, state.isOpen, state.mode, toggle],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        commands={commands}
        explorerError={explorer.error}
        explorerItems={explorer.items}
        explorerLoading={explorer.isLoading}
        isOpen={state.isOpen}
        mode={state.mode}
        onClose={close}
      />
    </CommandPaletteContext.Provider>
  );
}
