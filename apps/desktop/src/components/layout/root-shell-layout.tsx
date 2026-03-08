import { Outlet } from "react-router-dom";
import { AppHotkeyListener } from "../../app/app-hotkey-listener";
import { TitleBar } from "./title-bar";

export function RootShellLayout() {
  return (
    <div className="flex h-full w-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <AppHotkeyListener />
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
