#!/bin/sh
set -eu

if [ -z "${LIFECYCLE_WORKSPACE_ID:-}" ]; then
  exit 0
fi

terminal_id="${LIFECYCLE_TERMINAL_ID:-}"
if [ -z "$terminal_id" ] && command -v tmux >/dev/null 2>&1 && [ -n "${TMUX_PANE:-}" ]; then
  terminal_id="$(tmux display-message -p -t "$TMUX_PANE" '#{window_id}' 2>/dev/null || true)"
fi

if [ -z "$terminal_id" ]; then
  exit 0
fi

cli_bin="${LIFECYCLE_CLI_BIN:-lifecycle}"
"$cli_bin" workspace activity emit "$@" --terminal-id "$terminal_id" >/dev/null 2>&1 || exit 0
