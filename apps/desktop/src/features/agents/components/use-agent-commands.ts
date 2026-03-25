import { useMemo } from "react";
import { ImagePlus, ListRestart, Pencil, RefreshCw, Sparkles } from "lucide-react";
import type { CommandPaletteCommand } from "@/features/command-palette/types";

interface UseAgentCommandsOptions {
  onNewSession?: () => void;
  onTogglePlanMode?: () => void;
  onAttachImage?: () => void;
  onClearConversation?: () => void;
  onChangeModel?: () => void;
}

export function useAgentCommands(options: UseAgentCommandsOptions): CommandPaletteCommand[] {
  const { onNewSession, onTogglePlanMode, onAttachImage, onClearConversation, onChangeModel } =
    options;

  return useMemo(() => {
    const commands: CommandPaletteCommand[] = [];

    if (onNewSession) {
      commands.push({
        id: "agent:new",
        category: "action",
        label: "/new",
        description: "Start a new agent session",
        keywords: ["new", "session", "fresh", "start"],
        icon: Sparkles,
        onExecute: onNewSession,
      });
    }

    if (onTogglePlanMode) {
      commands.push({
        id: "agent:plan",
        category: "action",
        label: "/plan",
        description: "Toggle plan mode",
        keywords: ["plan", "mode", "read-only", "readonly"],
        icon: Pencil,
        onExecute: onTogglePlanMode,
      });
    }

    if (onChangeModel) {
      commands.push({
        id: "agent:model",
        category: "action",
        label: "/model",
        description: "Change model",
        keywords: ["model", "switch", "change"],
        icon: RefreshCw,
        onExecute: onChangeModel,
      });
    }

    if (onClearConversation) {
      commands.push({
        id: "agent:clear",
        category: "action",
        label: "/clear",
        description: "Clear conversation",
        keywords: ["clear", "reset", "clean"],
        icon: ListRestart,
        onExecute: onClearConversation,
      });
    }

    if (onAttachImage) {
      commands.push({
        id: "agent:image",
        category: "action",
        label: "/image",
        description: "Attach an image",
        keywords: ["image", "attach", "screenshot", "picture"],
        icon: ImagePlus,
        onExecute: onAttachImage,
      });
    }

    return commands;
  }, [onNewSession, onTogglePlanMode, onAttachImage, onClearConversation, onChangeModel]);
}
