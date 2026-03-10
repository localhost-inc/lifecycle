import type { TerminalRecord } from "@lifecycle/contracts";
import { NativeTerminalSurface } from "./native-terminal-surface";

interface TerminalSurfaceProps {
  active: boolean;
  terminal: TerminalRecord;
}

export function TerminalSurface(props: TerminalSurfaceProps) {
  return <NativeTerminalSurface {...props} />;
}
