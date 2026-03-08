import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  sidebarMenuButtonVariants,
} from "./sidebar";

describe("sidebarMenuButtonVariants", () => {
  test("uses the shared active sidebar treatment", () => {
    const className = sidebarMenuButtonVariants({ active: true });

    expect(className).toContain("bg-[var(--sidebar-selected)]");
    expect(className).toContain("text-[var(--sidebar-foreground)]");
  });

  test("uses the shared idle sidebar hover treatment", () => {
    const className = sidebarMenuButtonVariants({ active: false });

    expect(className).toContain("hover:bg-[var(--sidebar-hover)]");
    expect(className).toContain("text-[var(--sidebar-foreground)]");
  });
});

describe("Sidebar", () => {
  test("uses the shared sidebar token surface and configured width", () => {
    const markup = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        {
          sidebarWidth: "19rem",
        },
        createElement(
          Sidebar,
          {
            collapsible: "none",
          },
          createElement(
            SidebarContent,
            null,
            createElement(
              SidebarMenu,
              null,
              createElement(
                SidebarMenuItem,
                null,
                createElement(SidebarMenuButton, null, "Workspaces"),
              ),
            ),
          ),
        ),
      ),
    );

    expect(markup).toContain("bg-[var(--sidebar-background)]");
    expect(markup).toContain("text-[var(--sidebar-foreground)]");
    expect(markup).toContain("--sidebar-width:19rem");
  });
});
