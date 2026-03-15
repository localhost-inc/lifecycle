import { describe, expect, mock, test } from "bun:test";
import {
  dispatchRegisteredShortcutEvent,
  readRegisteredShortcutMatch,
  SHORTCUT_HANDLER_PRIORITY,
  type ShortcutDispatchRegistration,
  type ShortcutRouterKeyEvent,
} from "./shortcut-router";

function createShortcutEvent(
  overrides: Partial<ShortcutRouterKeyEvent> = {},
): ShortcutRouterKeyEvent & { defaultPrevented: boolean } {
  const event = {
    altKey: false,
    code: "",
    ctrlKey: false,
    defaultPrevented: false,
    key: "",
    metaKey: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
    shiftKey: false,
    target: null,
    ...overrides,
  };

  return event;
}

function createRegistration(
  registration: Omit<ShortcutDispatchRegistration, "order"> & {
    order?: number;
  },
): ShortcutDispatchRegistration {
  return {
    order: registration.order ?? 0,
    ...registration,
  };
}

describe("shortcut router matching", () => {
  test("reads indexed workspace tab shortcuts from the central router matcher", () => {
    expect(
      readRegisteredShortcutMatch(
        "workspace.select-tab-index",
        createShortcutEvent({
          code: "Digit3",
          key: "3",
          metaKey: true,
        }),
        true,
      ),
    ).toEqual({
      id: "workspace.select-tab-index",
      index: 3,
    });
  });

  test("reads project history shortcuts from the central router matcher", () => {
    expect(
      readRegisteredShortcutMatch(
        "project.go-back",
        createShortcutEvent({
          code: "BracketLeft",
          ctrlKey: true,
          key: "[",
        }),
        false,
      ),
    ).toEqual({
      id: "project.go-back",
    });
  });
});

describe("shortcut router dispatch", () => {
  test("prefers the highest-priority matching registration", () => {
    const projectClose = mock(() => true);
    const workspaceClose = mock(() => true);
    const event = createShortcutEvent({
      code: "KeyW",
      key: "w",
      metaKey: true,
    });

    expect(
      dispatchRegisteredShortcutEvent({
        event,
        macPlatform: true,
        registrations: [
          createRegistration({
            handler: projectClose,
            id: "workspace.close-active-tab",
            order: 0,
            priority: SHORTCUT_HANDLER_PRIORITY.project,
          }),
          createRegistration({
            handler: workspaceClose,
            id: "workspace.close-active-tab",
            order: 1,
            priority: SHORTCUT_HANDLER_PRIORITY.workspace,
          }),
        ],
      }),
    ).toEqual({
      id: "workspace.close-active-tab",
    });

    expect(workspaceClose).toHaveBeenCalledTimes(1);
    expect(projectClose).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  test("falls through when a higher-priority handler declines the shortcut", () => {
    const projectClose = mock(() => true);
    const workspaceClose = mock(() => false);
    const event = createShortcutEvent({
      code: "KeyW",
      key: "w",
      metaKey: true,
    });

    expect(
      dispatchRegisteredShortcutEvent({
        event,
        macPlatform: true,
        registrations: [
          createRegistration({
            handler: projectClose,
            id: "workspace.close-active-tab",
            order: 0,
            priority: SHORTCUT_HANDLER_PRIORITY.project,
          }),
          createRegistration({
            handler: workspaceClose,
            id: "workspace.close-active-tab",
            order: 1,
            priority: SHORTCUT_HANDLER_PRIORITY.workspace,
          }),
        ],
      }),
    ).toEqual({
      id: "workspace.close-active-tab",
    });

    expect(workspaceClose).toHaveBeenCalledTimes(1);
    expect(projectClose).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  test("does not re-handle already prevented events", () => {
    const handler = mock(() => true);

    expect(
      dispatchRegisteredShortcutEvent({
        event: createShortcutEvent({
          code: "KeyK",
          defaultPrevented: true,
          key: "k",
          metaKey: true,
        }),
        macPlatform: true,
        registrations: [
          createRegistration({
            handler,
            id: "app.open-command-palette",
            priority: SHORTCUT_HANDLER_PRIORITY.app,
          }),
        ],
      }),
    ).toBeNull();

    expect(handler).not.toHaveBeenCalled();
  });
});
