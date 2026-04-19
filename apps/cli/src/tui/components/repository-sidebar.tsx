import { type SidebarEntry, workspaceShortLabel } from "../opentui-helpers";
import type { FocusTarget } from "../tui-models";
import type { TuiTheme } from "../tui-theme";

interface RepositorySidebarProps {
  emptyMessage: string;
  focus: FocusTarget;
  onRepositoryPress: (repositoryId: string) => void;
  onWorkspacePress: (workspaceId: string) => void;
  selectedWorkspaceId: string | null;
  sidebarEntries: SidebarEntry[];
  sidebarSelectionKey: string | null;
  sidebarWidth: number;
  theme: TuiTheme;
  title: string;
}

export function RepositorySidebar(props: RepositorySidebarProps) {
  const isFocused = props.focus === "sidebar";
  const selectedRowBackground = props.theme.sidebar.selected;

  return (
    <box
      style={{
        border: ["right"],
        borderColor: isFocused ? props.theme.border.emphasis : props.theme.border.default,
        flexDirection: "column",
        paddingRight: 1,
        width: props.sidebarWidth,
      }}
    >
      <box
        style={{
          border: ["bottom"],
          borderColor: isFocused ? props.theme.border.emphasis : props.theme.border.default,
          flexDirection: "column",
          paddingBottom: 1,
          paddingLeft: 1,
          paddingTop: 1,
        }}
      >
        <text fg={props.theme.foreground}>{props.title}</text>
        <text fg={props.theme.mutedForeground}>↑↓ select · ←→ fold</text>
      </box>

      <scrollbox focused={isFocused} style={{ flexGrow: 1, marginTop: 1, paddingLeft: 1 }}>
        {props.sidebarEntries.length === 0 ? (
          <text fg={props.theme.mutedForeground}>{props.emptyMessage}</text>
        ) : (
          props.sidebarEntries.map((entry) => {
            const isSidebarSelected = entry.key === props.sidebarSelectionKey;

            if (entry.kind === "repository") {
              const repoSummary =
                entry.isCollapsed && entry.activeWorkspace
                  ? `active · ${workspaceShortLabel(entry.activeWorkspace)}`
                  : null;
              const repositoryChevron = entry.isCollapsed ? "›" : "⌄";

              return (
                <box
                  key={entry.key}
                  onMouseDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    props.onRepositoryPress(entry.repository.id);
                  }}
                  style={{
                    flexDirection: "column",
                    marginBottom: entry.isCollapsed ? 1 : 0,
                    paddingLeft: 1,
                    paddingRight: 1,
                    ...(isSidebarSelected ? { backgroundColor: selectedRowBackground } : {}),
                  }}
                >
                  <text
                    fg={
                      isSidebarSelected
                        ? props.theme.foreground
                        : entry.activeWorkspace
                          ? props.theme.sidebar.foreground
                          : props.theme.sidebar.mutedForeground
                    }
                  >
                    {repositoryChevron} {entry.repository.slug}
                  </text>
                  {repoSummary ? (
                    <text
                      fg={
                        entry.activeWorkspace
                          ? props.theme.mutedForeground
                          : props.theme.state.neutral
                      }
                    >
                      {repoSummary}
                    </text>
                  ) : null}
                </box>
              );
            }

            const isWorkspaceSelected = entry.workspace.id === props.selectedWorkspaceId;
            return (
              <box
                key={entry.key}
                onMouseDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  props.onWorkspacePress(entry.workspace.id);
                }}
                style={{
                  flexDirection: "column",
                  marginBottom: 1,
                  paddingLeft: 3,
                  paddingRight: 1,
                  ...(isSidebarSelected ? { backgroundColor: selectedRowBackground } : {}),
                }}
              >
                <text
                  fg={
                    isWorkspaceSelected
                      ? props.theme.foreground
                      : isSidebarSelected
                        ? props.theme.sidebar.foreground
                        : props.theme.sidebar.mutedForeground
                  }
                >
                  {workspaceShortLabel(entry.workspace)}
                </text>
                <text fg={props.theme.mutedForeground}>
                  {entry.workspace.host} · {entry.workspace.status}
                </text>
              </box>
            );
          })
        )}
      </scrollbox>
    </box>
  );
}
