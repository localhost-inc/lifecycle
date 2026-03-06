import { Outlet } from "react-router-dom";
import { TitleBar } from "./title-bar";

export function RootShellLayout() {
  return (
    <div className="flex h-screen w-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
