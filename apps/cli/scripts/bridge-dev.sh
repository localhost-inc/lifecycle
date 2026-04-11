#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WATCH_DIR="$PACKAGE_DIR"
WATCH_NAME="lifecycle-bridge-dev"
BRIDGE_PORT="${LIFECYCLE_BRIDGE_PORT:-52222}"

RUNTIME_DIR="$(mktemp -d -t lifecycle-bridge-dev.XXXXXX)"
RESTART_FILE="$RUNTIME_DIR/restart"

if [[ -n "${LIFECYCLE_RUNTIME_ROOT:-}" && -z "${LIFECYCLE_ROOT:-}" ]]; then
  export LIFECYCLE_ROOT="$LIFECYCLE_RUNTIME_ROOT"
fi

if [[ "${LIFECYCLE_DEV_SUPERVISOR:-}" == "monorepo" ]]; then
  cd "$PACKAGE_DIR"
  exec bun ./src/bridge/app.ts --port "$BRIDGE_PORT"
fi

bridge_registration_path() {
  if [[ -n "${LIFECYCLE_BRIDGE_REGISTRATION:-}" ]]; then
    printf '%s\n' "$LIFECYCLE_BRIDGE_REGISTRATION"
    return
  fi

  if [[ -n "${LIFECYCLE_RUNTIME_ROOT:-}" ]]; then
    printf '%s/bridge.json\n' "$LIFECYCLE_RUNTIME_ROOT"
    return
  fi

  printf '%s/bridge.json\n' "${LIFECYCLE_ROOT:-$HOME/.lifecycle}"
}

process_alive() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

registered_bridge_pid() {
  local registration_path
  registration_path="$(bridge_registration_path)"
  [[ -f "$registration_path" ]] || return 1

  local pid
  pid="$(sed -nE 's/.*"pid"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' "$registration_path" | head -n 1)"
  [[ -n "$pid" ]] || return 1
  printf '%s\n' "$pid"
}

wait_for_process_exit() {
  local pid="$1"
  local attempts="${2:-50}"
  local attempt
  for attempt in $(seq 1 "$attempts"); do
    if ! process_alive "$pid"; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

stop_bridge_process() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  process_alive "$pid" || return 0

  kill -TERM "$pid" >/dev/null 2>&1 || true
  if ! wait_for_process_exit "$pid" 50; then
    kill -KILL "$pid" >/dev/null 2>&1 || true
    wait_for_process_exit "$pid" 20 || true
  fi
}

stop_registered_bridge() {
  local pid=""
  if pid="$(registered_bridge_pid 2>/dev/null || true)"; then
    stop_bridge_process "$pid"
  fi
}

restart_requested() {
  [[ -f "$RESTART_FILE" ]]
}

clear_restart_request() {
  rm -f "$RESTART_FILE" >/dev/null 2>&1 || true
}

drain_initial_watch_events() {
  local stable_checks=0
  while (( stable_checks < 5 )); do
    if restart_requested; then
      clear_restart_request
      stable_checks=0
    else
      stable_checks=$((stable_checks + 1))
    fi
    sleep 0.1
  done
}

install_watch() {
  local registration_path
  registration_path="$(bridge_registration_path)"
  local trigger_script="$RUNTIME_DIR/restart-bridge.sh"

  cat >"$trigger_script" <<EOF
#!/bin/sh
touch "$RESTART_FILE"
if [ -f "$registration_path" ]; then
  pid=\$(sed -nE 's/.*"pid"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' "$registration_path" | head -n 1)
  if [ -n "\$pid" ]; then
    kill -TERM "\$pid" >/dev/null 2>&1 || true
  fi
fi
EOF
  chmod +x "$trigger_script"

  watchman trigger-del "$WATCH_DIR" "$WATCH_NAME" >/dev/null 2>&1 || true
  watchman watch-del "$WATCH_DIR" >/dev/null 2>&1 || true
  watchman watch "$WATCH_DIR" >/dev/null

  cat <<EOF | watchman -j >/dev/null
["trigger", "$WATCH_DIR", {
  "name": "$WATCH_NAME",
  "expression": ["anyof",
    ["allof",
      ["dirname", "src"],
      ["suffix", "ts"]
    ],
    ["allof",
      ["dirname", "routes"],
      ["suffix", "ts"]
    ],
    ["match", "routed.gen.ts", "wholename"],
    ["match", "routed.config.ts", "wholename"],
    ["match", "package.json", "wholename"],
    ["match", "tsconfig.json", "wholename"]
  ],
  "command": ["$trigger_script"]
}]
EOF
}

cleanup() {
  trap - EXIT INT TERM
  watchman trigger-del "$WATCH_DIR" "$WATCH_NAME" >/dev/null 2>&1 || true
  watchman watch-del "$WATCH_DIR" >/dev/null 2>&1 || true
  stop_registered_bridge
  rm -rf "$RUNTIME_DIR" >/dev/null 2>&1 || true
}

request_stop() {
  cleanup
  exit 130
}

trap cleanup EXIT
trap request_stop INT TERM

install_watch
clear_restart_request
drain_initial_watch_events

while true; do
  clear_restart_request

  status=0
  (
    cd "$PACKAGE_DIR"
    exec bun ./src/bridge/app.ts --port "$BRIDGE_PORT"
  ) || status=$?

  if restart_requested; then
    clear_restart_request
    continue
  fi

  printf 'process exited with code %s; restarting in 1s\n' "$status"
  sleep 1
done
