import type { ScrollBoxRenderable } from "@opentui/core";
import type { RefObject } from "react";

import type { FocusTarget } from "../tui-models";
import type { TuiTheme } from "../tui-theme";

interface WorkspaceShellPanelProps {
  canvasCols: number;
  canvasRows: number;
  focus: FocusTarget;
  hasSelectedWorkspace: boolean;
  onCanvasMouseDown: () => void;
  onCanvasMouseScroll: () => void;
  shellError: string | null;
  terminalAnsi: string;
  terminalPlaceholder: string;
  terminalScrollRef: RefObject<ScrollBoxRenderable | null>;
  theme: TuiTheme;
}

export function WorkspaceShellPanel(props: WorkspaceShellPanelProps) {
  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
      }}
    >
      {props.hasSelectedWorkspace && !props.shellError ? (
        <scrollbox
          focused={props.focus === "canvas"}
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            props.onCanvasMouseDown();
          }}
          onMouseScroll={() => {
            props.onCanvasMouseScroll();
          }}
          ref={props.terminalScrollRef}
          style={{ flexGrow: 1 }}
        >
          <ghostty-terminal
            ansi={props.terminalAnsi}
            cols={props.canvasCols}
            rows={props.canvasRows}
            showCursor={props.focus === "canvas"}
            style={{ height: props.canvasRows, width: props.canvasCols }}
            trimEnd
          />
        </scrollbox>
      ) : (
        <box style={{ flexGrow: 1, paddingLeft: 1, paddingTop: 1 }}>
          <text
            fg={
              props.shellError
                ? props.theme.state.danger
                : props.focus === "canvas"
                  ? props.theme.sidebar.mutedForeground
                  : props.theme.mutedForeground
            }
          >
            {props.terminalPlaceholder}
          </text>
        </box>
      )}
    </box>
  );
}
