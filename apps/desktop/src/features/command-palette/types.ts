import type { ComponentType, SVGProps } from "react";

export type CommandPaletteCategory = "workspace" | "action" | "navigation";
export type CommandPaletteMode = "commands" | "files";

export interface CommandPaletteCommand {
  id: string;
  category: CommandPaletteCategory;
  description?: string;
  label: string;
  keywords: string[];
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  priority?: number;
  shortcut?: string;
  onExecute: () => void;
}
