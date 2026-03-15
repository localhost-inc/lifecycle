import { isTauri } from "@tauri-apps/api/core";
import { invokeTauri } from "../../lib/tauri-error";

export interface NativeTerminalTheme {
  background: string;
  cursorColor: string;
  foreground: string;
  palette: string[];
  selectionBackground: string;
  selectionForeground: string;
}

export interface SyncNativeTerminalSurfaceInput {
  appearance: "dark" | "light";
  focused: boolean;
  fontFamily: string;
  fontSize: number;
  height: number;
  pointerPassthrough: boolean;
  scaleFactor: number;
  terminalId: string;
  theme: NativeTerminalTheme;
  visible: boolean;
  width: number;
  x: number;
  y: number;
}

export interface SyncNativeTerminalSurfaceFrameInput {
  height: number;
  terminalId: string;
  width: number;
  x: number;
  y: number;
}

export async function syncNativeTerminalSurface(
  input: SyncNativeTerminalSurfaceInput,
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauri<void>("sync_native_terminal_surface", {
    input: {
      appearance: input.appearance,
      focused: input.focused,
      fontFamily: input.fontFamily,
      fontSize: input.fontSize,
      height: input.height,
      pointerPassthrough: input.pointerPassthrough,
      scaleFactor: input.scaleFactor,
      terminalId: input.terminalId,
      theme: input.theme,
      visible: input.visible,
      width: input.width,
      x: input.x,
      y: input.y,
    },
  });
}

export async function syncNativeTerminalSurfaceFrame(
  input: SyncNativeTerminalSurfaceFrameInput,
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauri<void>("sync_native_terminal_surface_frame", {
    input: {
      height: input.height,
      terminalId: input.terminalId,
      width: input.width,
      x: input.x,
      y: input.y,
    },
  });
}

export async function hideNativeTerminalSurface(terminalId: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauri<void>("hide_native_terminal_surface", { terminalId });
}
