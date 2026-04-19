import type { TuiTheme } from "../tui-theme";

export interface WorkspaceHeaderAction {
  disabled?: boolean | undefined;
  key: string;
  label: string;
  onPress: () => void;
  tone?: "default" | "danger" | undefined;
}

interface WorkspaceHeaderProps {
  actions: WorkspaceHeaderAction[];
  deleteBusy: boolean;
  deleteError: string | null;
  deletePromptLabel: string | null;
  deletePromptOpen: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: (force: boolean) => void;
  theme: TuiTheme;
  title: string | null;
}

function HeaderButton(props: {
  disabled?: boolean | undefined;
  label: string;
  onPress: () => void;
  theme: TuiTheme;
  tone?: "default" | "danger" | undefined;
}) {
  const backgroundColor = props.disabled ? props.theme.surface : props.theme.surfaceSelected;
  const foregroundColor = props.disabled
    ? props.theme.state.neutral
    : props.tone === "danger"
      ? props.theme.state.danger
      : props.theme.foreground;

  return (
    <box
      onMouseDown={(event) => {
        if (event.button !== 0 || props.disabled) {
          return;
        }
        event.preventDefault();
        props.onPress();
      }}
      style={{
        alignItems: "center",
        flexDirection: "row",
        backgroundColor,
        height: 1,
        marginLeft: 1,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text fg={foregroundColor}>{props.label}</text>
    </box>
  );
}

export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const actions = props.actions ?? [];

  return (
    <box
      style={{
        border: ["bottom"],
        borderColor: props.theme.border.default,
        flexDirection: "column",
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ alignItems: "center", flexDirection: "row", height: 1 }}>
        <text fg={props.theme.foreground}>{props.title ?? "Select a workspace"}</text>
        <box style={{ flexGrow: 1 }} />
        {actions.map((action) => (
          <box key={action.key} style={{ flexDirection: "row" }}>
            <HeaderButton
              disabled={action.disabled}
              label={action.label}
              onPress={action.onPress}
              theme={props.theme}
              tone={action.tone}
            />
          </box>
        ))}
      </box>
      {props.deletePromptOpen ? (
        <box style={{ flexDirection: "column", marginBottom: 1, marginTop: 1 }}>
          <box style={{ flexDirection: "row" }}>
            <text fg={props.theme.state.danger}>
              {props.deleteBusy
                ? `Deleting ${props.deletePromptLabel ?? "workspace"}...`
                : `Delete ${props.deletePromptLabel ?? "this workspace"}?`}
            </text>
            <box style={{ flexGrow: 1 }} />
            <HeaderButton
              disabled={props.deleteBusy}
              label="Cancel"
              onPress={props.onCancelDelete}
              theme={props.theme}
            />
            <HeaderButton
              disabled={props.deleteBusy}
              label="Delete"
              onPress={() => props.onConfirmDelete(false)}
              theme={props.theme}
              tone="danger"
            />
            <HeaderButton
              disabled={props.deleteBusy}
              label="Force delete"
              onPress={() => props.onConfirmDelete(true)}
              theme={props.theme}
              tone="danger"
            />
          </box>
          <text fg={props.theme.mutedForeground}>
            Removes the workspace from Lifecycle. Force delete skips the uncommitted-changes guard.
          </text>
          {props.deleteError ? (
            <text fg={props.theme.state.danger}>{props.deleteError}</text>
          ) : null}
        </box>
      ) : null}
    </box>
  );
}
