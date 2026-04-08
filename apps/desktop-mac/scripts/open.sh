#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
APP_BUNDLE="$("$SCRIPT_DIR/build.sh")"
EXECUTABLE_NAME="lifecycle-macos"
EXECUTABLE_PATH="$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"
DEV_ENV_SCRIPT="$SCRIPT_DIR/xcode-env.sh"
DEV_STATE_ROOT="${LIFECYCLE_DEV_STATE_ROOT:-$REPO_ROOT/.lifecycle-runtime-dev/dev}"
DEV_LOG_DIR="$DEV_STATE_ROOT/logs"
DEV_PID_DIR="$DEV_STATE_ROOT/pids"
APP_LOG_PATH="$DEV_LOG_DIR/desktop-mac-app.log"
APP_PID_FILE="$DEV_PID_DIR/desktop-mac-app.pid"

mkdir -p "$DEV_LOG_DIR" "$DEV_PID_DIR"

load_default_dev_environment() {
  [[ -x "$DEV_ENV_SCRIPT" ]] || return 0

  while IFS='=' read -r name value; do
    [[ "$name" == LIFECYCLE_* ]] || continue
    if [[ -z "${!name:-}" ]]; then
      export "$name=$value"
    fi
  done < <("$DEV_ENV_SCRIPT")
}

read_app_pid() {
  [[ -f "$APP_PID_FILE" ]] || return 1
  local pid
  pid="$(tr -dc '0-9' <"$APP_PID_FILE")"
  [[ -n "$pid" ]] || return 1
  printf '%s\n' "$pid"
}

write_app_pid() {
  printf '%s\n' "$1" >"$APP_PID_FILE"
}

clear_app_pid() {
  rm -f "$APP_PID_FILE" >/dev/null 2>&1 || true
}

process_alive() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

wait_for_pid_exit() {
  local pid="$1"
  local attempt
  for attempt in {1..50}; do
    if ! process_alive "$pid"; then
      return 0
    fi
    sleep 0.1
  done

  return 1
}

wait_for_pid_start() {
  local pid="$1"
  local attempt
  for attempt in {1..50}; do
    if process_alive "$pid"; then
      return 0
    fi
    sleep 0.1
  done

  return 1
}

stop_existing_app() {
  local pid=""

  if pid="$(read_app_pid 2>/dev/null || true)"; then
    kill -TERM "$pid" >/dev/null 2>&1 || true
    if ! wait_for_pid_exit "$pid"; then
      kill -KILL "$pid" >/dev/null 2>&1 || true
      wait_for_pid_exit "$pid" || true
    fi
  fi

  while IFS= read -r stale_pid; do
    [[ -n "$stale_pid" ]] || continue
    kill -TERM "$stale_pid" >/dev/null 2>&1 || true
  done < <(pgrep -f "$EXECUTABLE_PATH" || true)

  sleep 0.2
  while IFS= read -r stale_pid; do
    [[ -n "$stale_pid" ]] || continue
    kill -KILL "$stale_pid" >/dev/null 2>&1 || true
  done < <(pgrep -f "$EXECUTABLE_PATH" || true)

  clear_app_pid
}

activate_app_pid() {
  local pid="$1"
  osascript >/dev/null 2>&1 <<EOF || true
tell application "System Events"
  set frontmost of (first process whose unix id is $pid) to true
end tell
EOF
}

launch_app_directly() {
  local -a env_args=()

  for key in HOME PATH SHELL TMPDIR; do
    if [[ -n "${!key:-}" ]]; then
      env_args+=("$key=${!key}")
    fi
  done

  while IFS='=' read -r name value; do
    case "$name" in
      LIFECYCLE_*)
        env_args+=("$name=$value")
        ;;
    esac
  done < <(env)

  : >"$APP_LOG_PATH"
  env "${env_args[@]}" "$EXECUTABLE_PATH" >>"$APP_LOG_PATH" 2>&1 &
  write_app_pid "$!"
  printf '%s\n' "$!"
}

load_default_dev_environment

stop_existing_app

APP_PID="$(launch_app_directly)"

if ! wait_for_pid_start "$APP_PID"; then
  echo "Failed to launch lifecycle-macos. See $APP_LOG_PATH" >&2
  exit 1
fi

activate_app_pid "$APP_PID"
