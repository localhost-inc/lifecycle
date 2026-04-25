import { formatWorkspaceTabLabel } from "../opentui-helpers";
import type { FocusTarget, WorkspaceTerminalRecord } from "../tui-models";
import type { TuiTheme } from "../tui-theme";

interface WorkspaceSessionStripProps {
  activeTerminalId: string | null;
  focus: FocusTarget;
  onCreateTerminal: () => void;
  onTerminalPress: (terminalId: string) => void;
  terminals: WorkspaceTerminalRecord[];
  theme: TuiTheme;
}

export function WorkspaceSessionStrip(props: WorkspaceSessionStripProps) {
  const hasTerminals = props.terminals.length > 0;
  const createButtonColor =
    props.focus === "canvas" ? props.theme.foreground : props.theme.sidebar.mutedForeground;

  return (
    <box
      style={{
        alignItems: "center",
        border: ["bottom"],
        borderColor:
          props.focus === "canvas" ? props.theme.border.emphasis : props.theme.border.default,
        flexDirection: "row",
        height: 2,
      }}
    >
      {hasTerminals ? (
        props.terminals.map((terminal) => {
          const isActive = terminal.id === props.activeTerminalId;
          return (
            <box
              key={terminal.id}
              onMouseDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.preventDefault();
                props.onTerminalPress(terminal.id);
              }}
              style={{
                alignItems: "center",
                flexDirection: "row",
                height: 1,
                marginRight: 1,
                paddingLeft: 1,
                paddingRight: 1,
                ...(isActive ? { backgroundColor: props.theme.surfaceSelected } : {}),
              }}
            >
              <text fg={isActive ? props.theme.foreground : props.theme.sidebar.mutedForeground}>
                {formatWorkspaceTabLabel({
                  busy: terminal.activity?.busy ?? terminal.busy,
                  title: formatTerminalActivityTitle(terminal),
                })}
              </text>
            </box>
          );
        })
      ) : (
        <box style={{ paddingLeft: 1 }}>
          <text fg={props.theme.mutedForeground}>No open tabs</text>
        </box>
      )}

      <box style={{ flexGrow: 1 }} />
      <box
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          props.onCreateTerminal();
        }}
        style={{
          alignItems: "center",
          height: 1,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text fg={createButtonColor}>+</text>
      </box>
    </box>
  );
}

function formatTerminalActivityTitle(terminal: WorkspaceTerminalRecord): string {
  const activity = terminal.activity;
  if (!activity || activity.state === "idle" || activity.state === "unknown") {
    return terminal.title;
  }

  switch (activity.state) {
    case "waiting":
      return `${terminal.title} waiting`;
    case "tool_active":
      return `${terminal.title} ${activity.tool_name ?? "tool"}`;
    case "turn_active":
      return `${terminal.title} turn`;
    case "command_running":
      return `${terminal.title} running`;
    case "interactive_active":
      return `${terminal.title} active`;
    case "interactive_quiet":
      return terminal.title;
  }
}
