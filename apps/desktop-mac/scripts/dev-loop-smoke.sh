#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DEV_SCRIPT="$REPO_ROOT/scripts/dev"
LOG_FILE="$(mktemp -t lifecycle-macos-dev-loop.XXXXXX.log)"

SUPERVISOR_PID=""

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
    pkill -KILL -f 'packages/bridge/scripts/dev.sh' >/dev/null 2>&1 || true
    pkill -KILL -f 'src/app.ts --port 52222' >/dev/null 2>&1 || true
    pkill -KILL -f 'control-plane/node_modules/.bin/wrangler dev --ip 127.0.0.1 --port 18787' >/dev/null 2>&1 || true
    pkill -KILL -f 'workerd serve --binary --experimental --socket-addr=entry=127.0.0.1:18787' >/dev/null 2>&1 || true
    pkill -KILL -f 'lifecycle-macos' >/dev/null 2>&1 || true
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
  local registration_path="$REPO_ROOT/.lifecycle-runtime-dev/bridge.json"
  if [[ -f "$registration_path" ]]; then
    sed -nE 's/.*"pid"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' "$registration_path" | head -n 1
    return
  fi

  pgrep -f 'packages/bridge/scripts/dev.sh' | head -n 1 || \
    pgrep -f 'src/app.ts --port 52222' | head -n 1
}

current_control_plane_pid() {
  pgrep -f 'wrangler-dist/cli.js dev --ip 127.0.0.1 --port 18787' | head -n 1 || \
    pgrep -f 'wrangler dev --ip 127.0.0.1 --port 18787' | head -n 1
}

desktop_process_running() {
  pgrep -f 'dist/Lifecycle.app/Contents/MacOS/lifecycle-macos'
}

current_desktop_pid() {
  pgrep -n -f 'dist/Lifecycle.app/Contents/MacOS/lifecycle-macos'
}

bridge_healthy() {
  curl -sf http://127.0.0.1:52222/health >/dev/null
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
wait_for_command "desktop hot reload relaunch" 60 bash -lc 'NEW_PID="$(pgrep -n -f '"'"'dist/Lifecycle.app/Contents/MacOS/lifecycle-macos'"'"' || true)"; [[ -n "$NEW_PID" && "$NEW_PID" != "'"$DESKTOP_PID_BEFORE"'" ]]'

echo "desktop dev loop smoke passed"
