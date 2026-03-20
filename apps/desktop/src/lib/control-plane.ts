import type { ControlPlane } from "../../../../packages/runtime/src/control-plane.ts";
import { LocalControlPlane } from "../../../../packages/runtime/src/local-control-plane.ts";
import { invokeTauri } from "@/lib/tauri-error";

let localControlPlane: ControlPlane | null = null;

export function getControlPlane(): ControlPlane {
  localControlPlane ??= new LocalControlPlane((command, args) => invokeTauri(command, args));
  return localControlPlane;
}
