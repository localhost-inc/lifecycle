#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DEV_SCRIPT="$REPO_ROOT/scripts/dev"
DEV_RUNTIME_ROOT="${LIFECYCLE_RUNTIME_ROOT:-$("$REPO_ROOT/scripts/dev-runtime-root")}"
DEV_STATE_ROOT="${LIFECYCLE_DEV_STATE_ROOT:-$DEV_RUNTIME_ROOT/dev}"
DEV_PID_DIR="$DEV_STATE_ROOT/pids"
LOG_FILE="$(mktemp -t lifecycle-desktop-dev-loop.XXXXXX.log)"

SUPERVISOR_PID=""

pid_file() {
  printf '%s/%s.pid\n' "$DEV_PID_DIR" "$1"
}

read_pid_file() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  local pid
  pid="$(tr -dc '0-9' <"$path")"
  [[ -n "$pid" ]] || return 1
  printf '%s\n' "$pid"
}

cleanup() {
  if [[ -n "$SUPERVISOR_PID" ]] && kill -0 "$SUPERVISOR_PID" >/dev/null 2>&1; then
    kill -INT "$SUPERVISOR_PID" >/dev/null 2>&1 || true
    local attempt
    for attempt in {1..50}; do
      if ! kill -0 "$SUPERVISOR_PID" >/dev/null 2>&1; then
        break
      fi
      sleep 0.1
    done
    if kill -0 "$SUPERVISOR_PID" >/dev/null 2>&1; then
      kill -TERM "$SUPERVISOR_PID" >/dev/null 2>&1 || true
      sleep 0.2
    fi
    if kill -0 "$SUPERVISOR_PID" >/dev/null 2>&1; then
      kill -KILL "$SUPERVISOR_PID" >/dev/null 2>&1 || true
    fi
    wait "$SUPERVISOR_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$LOG_FILE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "dev-loop smoke failed: $*" >&2
  echo "log file: $LOG_FILE" >&2
  echo "--- supervisor log ---" >&2
  tail -n 200 "$LOG_FILE" >&2 || true
  exit 1
}

step() {
  echo "[smoke] $*"
}

wait_for_command() {
  local description="$1"
  local timeout_seconds="$2"
  shift 2

  local start
  start=$(date +%s)
  while true; do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi

    if (( $(date +%s) - start >= timeout_seconds )); then
      fail "timed out waiting for ${description}"
    fi
    sleep 0.2
  done
}

current_bridge_pid() {
  local registration_path="$DEV_RUNTIME_ROOT/bridge.json"
  [[ -f "$registration_path" ]] || return 1
  sed -nE 's/.*"pid"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' "$registration_path" | head -n 1
}

current_control_plane_pid() {
  read_pid_file "$(pid_file "control-plane")"
}

desktop_process_running() {
  read_pid_file "$(pid_file "desktop-mac-app")" >/dev/null
}

current_desktop_pid() {
  read_pid_file "$(pid_file "desktop-mac-app")"
}

bridge_healthy() {
  curl -sf http://127.0.0.1:52300/health >/dev/null
}

control_plane_responding() {
  curl -s -o /dev/null http://127.0.0.1:18787
}

if pgrep -f "$DEV_SCRIPT desktop" >/dev/null 2>&1 || bridge_healthy || control_plane_responding; then
  fail "expected no existing desktop dev supervisor or bound dev services"
fi

"$DEV_SCRIPT" desktop >"$LOG_FILE" 2>&1 &
SUPERVISOR_PID=$!

step "waiting for bridge"
wait_for_command "bridge health" 45 bridge_healthy
step "waiting for control plane"
wait_for_command "control-plane readiness" 45 control_plane_responding
step "waiting for desktop app"
wait_for_command "desktop app process" 45 desktop_process_running

BRIDGE_PID_BEFORE="$(current_bridge_pid)"
[[ -n "$BRIDGE_PID_BEFORE" ]] || fail "could not resolve bridge pid after startup"
step "restarting bridge pid $BRIDGE_PID_BEFORE"
kill -TERM "$BRIDGE_PID_BEFORE" >/dev/null 2>&1 || fail "failed to stop bridge pid $BRIDGE_PID_BEFORE"
wait_for_command "bridge restart" 45 bridge_healthy
BRIDGE_PID_AFTER="$(current_bridge_pid)"
[[ -n "$BRIDGE_PID_AFTER" && "$BRIDGE_PID_AFTER" != "$BRIDGE_PID_BEFORE" ]] || fail "bridge did not restart with a new pid"
wait_for_command "desktop app after bridge restart" 20 desktop_process_running

CONTROL_PID_BEFORE="$(current_control_plane_pid)"
[[ -n "$CONTROL_PID_BEFORE" ]] || fail "could not resolve control-plane pid after startup"
step "restarting control plane pid $CONTROL_PID_BEFORE"
kill -TERM "$CONTROL_PID_BEFORE" >/dev/null 2>&1 || fail "failed to stop control-plane pid $CONTROL_PID_BEFORE"
wait_for_command "control-plane restart" 45 control_plane_responding
CONTROL_PID_AFTER="$(current_control_plane_pid)"
[[ -n "$CONTROL_PID_AFTER" && "$CONTROL_PID_AFTER" != "$CONTROL_PID_BEFORE" ]] || fail "control-plane did not restart with a new pid"

DESKTOP_PID_BEFORE="$(current_desktop_pid)"
[[ -n "$DESKTOP_PID_BEFORE" ]] || fail "could not resolve desktop pid before hot reload"
step "triggering desktop hot reload"
touch "$REPO_ROOT/apps/desktop-mac/Package.swift"
wait_for_command "desktop hot reload relaunch" 60 bash -lc 'NEW_PID="$(pgrep -n -f '"'"'dist/Lifecycle.app/Contents/MacOS/Lifecycle'"'"' || true)"; [[ -n "$NEW_PID" && "$NEW_PID" != "'"$DESKTOP_PID_BEFORE"'" ]]'

echo "desktop dev loop smoke passed"
