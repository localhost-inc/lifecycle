import { ThemeProvider } from "@lifecycle/ui";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuthSession } from "@/features/auth/auth-session";
import { AuthSessionSettingsPanel } from "@/features/auth/components/auth-session-settings-panel";

const loggedInAuthSession: AuthSession = {
  identity: {
    avatarUrl: "https://avatars.githubusercontent.com/u/14184138?v=4",
    displayName: "Kyle Alwyn",
    handle: "kylealwyn",
  },
  message: null,
  provider: "github",
  source: "local_cli",
  state: "logged_in",
};

describe("AuthSessionSettingsPanel", () => {
  test("renders the account summary with refresh controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        storageKey: "test.theme",
        children: createElement(AuthSessionSettingsPanel, {
          isLoading: false,
          onRefresh: () => {},
          session: loggedInAuthSession,
        }),
      }),
    );

    expect(markup).toContain("Kyle Alwyn");
    expect(markup).toContain("@kylealwyn");
    expect(markup).toContain("Refresh status");
    expect(markup).toContain('src="https://avatars.githubusercontent.com/u/14184138?v=4"');
  });
});
