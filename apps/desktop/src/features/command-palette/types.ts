import type { ComponentType, SVGProps } from "react";

export type CommandPaletteCategory = "workspace" | "action" | "navigation";

export interface CommandPaletteCommand {
  id: string;
  category: CommandPaletteCategory;
  label: string;
  keywords: string[];
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  shortcut?: string;
  onExecute: () => void;
}
