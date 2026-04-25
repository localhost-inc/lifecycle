import type {
  FocusTarget,
  WorkspaceDetailResponse,
  WorkspaceExtensionKind,
  WorkspaceStackNode,
  WorkspaceTerminalRecord,
  WorkspaceTerminalsEnvelope,
} from "../tui-models";
import type { TuiTheme } from "../tui-theme";

interface WorkspaceExtensionSidebarProps {
  detail: WorkspaceDetailResponse | null;
  focus: FocusTarget;
  onSelectExtension: (kind: WorkspaceExtensionKind) => void;
  selectedExtension: WorkspaceExtensionKind;
  terminals: WorkspaceTerminalRecord[];
  terminalsEnvelope: WorkspaceTerminalsEnvelope | null;
  theme: TuiTheme;
  width: number;
  workspacePath: string | null;
}

const EXTENSION_TABS: Array<{ kind: WorkspaceExtensionKind; title: string }> = [
  { kind: "stack", title: "Stack" },
  { kind: "debug", title: "Debug" },
];

const STACK_PREVIEW_ICON = "↗";
const STACK_STATUS_DOT = "●";

function stackNodeStatusColor(theme: TuiTheme, node: WorkspaceStackNode): string {
  switch ((node.status ?? "unknown").toLowerCase()) {
    case "active":
    case "ready":
    case "running":
      return theme.state.info;
    case "error":
    case "failed":
    case "stopped":
      return theme.state.danger;
    default:
      return theme.state.neutral;
  }
}

function stackNodeLinkIcons(node: WorkspaceStackNode): string[] {
  return node.preview_url ? [STACK_PREVIEW_ICON] : [];
}

export function WorkspaceExtensionSidebar(props: WorkspaceExtensionSidebarProps) {
  const isFocused = props.focus === "extensions";
  const runtime = props.terminalsEnvelope?.runtime ?? null;
  const scope = props.terminalsEnvelope?.workspace ?? null;

  return (
    <box
      style={{
        border: ["left"],
        borderColor: isFocused ? props.theme.border.emphasis : props.theme.border.default,
        flexDirection: "column",
        width: props.width,
      }}
    >
      <box
        style={{
          alignItems: "center",
          border: ["bottom"],
          borderColor: isFocused ? props.theme.border.emphasis : props.theme.border.default,
          flexDirection: "row",
          height: 2,
          paddingLeft: 1,
        }}
      >
        {EXTENSION_TABS.map((tab) => {
          const isSelected = tab.kind === props.selectedExtension;
          return (
            <box
              key={tab.kind}
              onMouseDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.preventDefault();
                props.onSelectExtension(tab.kind);
              }}
              style={{
                alignItems: "center",
                height: 1,
                marginRight: 1,
                paddingLeft: 1,
                paddingRight: 1,
                ...(isSelected ? { backgroundColor: props.theme.surfaceSelected } : {}),
              }}
            >
              <text fg={isSelected ? props.theme.foreground : props.theme.sidebar.mutedForeground}>
                {tab.title}
              </text>
            </box>
          );
        })}
      </box>

      <scrollbox focused={isFocused} style={{ flexGrow: 1, paddingLeft: 1, paddingRight: 1 }}>
        {props.selectedExtension === "stack" ? (
          <box style={{ flexDirection: "column", paddingTop: 1 }}>
            <text fg={props.theme.foreground}>Stack</text>
            <text fg={props.theme.mutedForeground}>
              {props.detail
                ? `state ${props.detail.stack.state}`
                : "Waiting for workspace detail..."}
            </text>
            {props.detail?.stack.errors.length ? (
              props.detail.stack.errors.map((error) => (
                <text key={error} fg={props.theme.state.danger}>
                  {error}
                </text>
              ))
            ) : (
              <text fg={props.theme.mutedForeground}>
                {props.detail?.stack.nodes.length
                  ? `${props.detail.stack.nodes.length} configured nodes`
                  : "No stack nodes reported."}
              </text>
            )}
            {props.detail?.stack.nodes.map((node) => {
              const linkIcons = stackNodeLinkIcons(node);

              return (
                <box key={node.name} style={{ flexDirection: "row", marginTop: 1 }}>
                  <text fg={stackNodeStatusColor(props.theme, node)}>{STACK_STATUS_DOT}</text>
                  <text fg={props.theme.sidebar.foreground}> {node.name}</text>
                  <box style={{ flexGrow: 1 }} />
                  {linkIcons.length ? (
                    <text fg={props.theme.state.info}>{linkIcons.join(" ")}</text>
                  ) : null}
                </box>
              );
            })}
          </box>
        ) : (
          <box style={{ flexDirection: "column", paddingTop: 1 }}>
            <text fg={props.theme.foreground}>Debug</text>
            <text fg={props.theme.mutedForeground}>
              {[scope?.host ?? null, scope?.status ?? null, runtime?.backend_label ?? null]
                .filter((value): value is string => Boolean(value))
                .join(" · ") || "Waiting for runtime..."}
            </text>
            {props.workspacePath ? (
              <text fg={props.theme.mutedForeground}>{props.workspacePath}</text>
            ) : null}
            {scope?.source_ref ? (
              <text fg={props.theme.mutedForeground}>ref {scope.source_ref}</text>
            ) : null}
            {runtime?.launch_error ? (
              <text fg={props.theme.state.danger}>{runtime.launch_error}</text>
            ) : null}

            <box style={{ flexDirection: "column", marginTop: 1 }}>
              <text fg={props.theme.sidebar.foreground}>Terminals</text>
              <text fg={props.theme.mutedForeground}>
                {props.terminals.length === 0
                  ? "No terminals yet."
                  : `${props.terminals.length} terminal${props.terminals.length === 1 ? "" : "s"}`}
              </text>
              {props.terminals.map((terminal) => (
                <text key={terminal.id} fg={props.theme.sidebar.mutedForeground}>
                  {(terminal.activity?.busy ?? terminal.busy) ? "* " : ""}
                  {terminal.title} · {terminal.kind}
                  {terminal.activity ? ` · ${formatTerminalActivity(terminal)}` : ""}
                </text>
              ))}
            </box>
          </box>
        )}
      </scrollbox>
    </box>
  );
}

function formatTerminalActivity(terminal: WorkspaceTerminalRecord): string {
  const activity = terminal.activity;
  if (!activity) {
    return terminal.busy ? "busy" : "idle";
  }

  if (activity.state === "tool_active" && activity.tool_name) {
    return `${activity.state}:${activity.tool_name}`;
  }
  if (activity.state === "waiting" && activity.waiting_kind) {
    return `${activity.state}:${activity.waiting_kind}`;
  }
  return activity.state;
}
