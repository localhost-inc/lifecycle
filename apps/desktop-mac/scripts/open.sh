#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_BUNDLE="$("$SCRIPT_DIR/build.sh")"
APP_BUNDLE_ID="dev.lifecycle.macos"
EXECUTABLE_NAME="lifecycle-macos"
EXECUTABLE_PATH="$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"
DEV_ENV_SCRIPT="$SCRIPT_DIR/xcode-env.sh"

load_default_dev_environment() {
  [[ -x "$DEV_ENV_SCRIPT" ]] || return 0

  while IFS='=' read -r name value; do
    [[ "$name" == LIFECYCLE_* ]] || continue
    if [[ -z "${!name:-}" ]]; then
      export "$name=$value"
    fi
  done < <("$DEV_ENV_SCRIPT")
}

wait_for_process_exit() {
  local attempt
  for attempt in {1..50}; do
    if ! pgrep -f "$EXECUTABLE_PATH" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done

  return 1
}

wait_for_process_start() {
  local attempt
  for attempt in {1..50}; do
    if pgrep -f "$EXECUTABLE_PATH" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done

  return 1
}

activate_app() {
  osascript >/dev/null 2>&1 <<EOF || true
tell application id "$APP_BUNDLE_ID"
  reopen
  activate
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

  nohup env "${env_args[@]}" "$EXECUTABLE_PATH" >/tmp/lifecycle-macos.log 2>&1 &
}

launch_app_via_launch_services() {
  open -na "$APP_BUNDLE"
}

load_default_dev_environment

pkill -f lifecycle-macos >/dev/null 2>&1 || true
wait_for_process_exit || true

launch_app_directly

if ! wait_for_process_start; then
  launch_app_via_launch_services
  if ! wait_for_process_start; then
    echo "Failed to launch lifecycle-macos. See /tmp/lifecycle-macos.log" >&2
    exit 1
  fi
fi

activate_app
