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

if [ "$#" -gt 0 ] && [ "$1" = "turn.started" ] && [ ! -t 0 ] && command -v node >/dev/null 2>&1; then
  hook_input="$(cat || true)"
  if [ -n "$hook_input" ]; then
    hook_prompt="$(printf '%s' "$hook_input" | node -e 'let raw=""; process.stdin.setEncoding("utf8"); process.stdin.on("data", c => raw += c); process.stdin.on("end", () => { try { const data = JSON.parse(raw); const value = data.prompt ?? data.input ?? data.message ?? data.text ?? data.userPrompt ?? data.payload?.prompt ?? data.payload?.input ?? data.properties?.prompt ?? data.properties?.input ?? ""; if (typeof value === "string" && value.trim()) process.stdout.write(value.trim()); } catch {} });' || true)"
    hook_turn_id="$(printf '%s' "$hook_input" | node -e 'let raw=""; process.stdin.setEncoding("utf8"); process.stdin.on("data", c => raw += c); process.stdin.on("end", () => { try { const data = JSON.parse(raw); const value = data.turn_id ?? data.turnId ?? data.payload?.turn_id ?? data.payload?.turnId ?? data.properties?.turn_id ?? data.properties?.turnId ?? ""; if (typeof value === "string" && value.trim()) process.stdout.write(value.trim()); } catch {} });' || true)"
    if [ -n "$hook_prompt" ]; then
      set -- "$@" --prompt "$hook_prompt"
    fi
    if [ -n "$hook_turn_id" ]; then
      set -- "$@" --turn-id "$hook_turn_id"
    fi
  fi
fi

cli_bin="${LIFECYCLE_CLI_BIN:-lifecycle}"
"$cli_bin" workspace activity emit "$@" --terminal-id "$terminal_id" >/dev/null 2>&1 || exit 0
