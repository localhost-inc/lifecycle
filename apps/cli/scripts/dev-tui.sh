#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ROOT_DEV_SCRIPT="$REPO_ROOT/scripts/dev"
ENV_SCRIPT="$REPO_ROOT/apps/desktop-mac/scripts/xcode-env.sh"
DEV_RUNTIME_ROOT="${LIFECYCLE_RUNTIME_ROOT:-$("$REPO_ROOT/scripts/dev-runtime-root")}"
DEV_STATE_ROOT="${LIFECYCLE_DEV_STATE_ROOT:-$DEV_RUNTIME_ROOT/dev}"
DEV_LOG_DIR="$DEV_STATE_ROOT/logs"
SERVICES_LOG_FILE="$DEV_LOG_DIR/tui-services.log"

services_pid=""
started_services=0
use_local_services=0

usage() {
  cat <<'EOF'
usage: dev-tui.sh [--local]

Starts the CLI-owned TUI dev loop.

Behavior:
  default:
    - launches the TUI against the standard local Lifecycle runtime
    - restarts automatically when TUI/CLI source files change
    - does not force repo-dev bridge or control-plane overrides
    - lets the CLI bootstrap the local bridge when needed

  --local:
    - loads the monorepo dev environment
    - restarts automatically when TUI/CLI source files change
    - reuses bridge/control-plane services if already healthy
    - otherwise starts `scripts/dev desktop-services` in the background
    - launches the CLI TUI entrypoint in the foreground
EOF
}

load_monorepo_dev_environment() {
  while IFS='=' read -r name value; do
    [[ "$name" == LIFECYCLE_* ]] || continue
    if [[ -z "${!name:-}" ]]; then
      export "$name=$value"
    fi
  done < <("$ENV_SCRIPT")
}

clear_monorepo_dev_environment() {
  unset LIFECYCLE_API_PORT || true
  unset LIFECYCLE_API_URL || true
  unset LIFECYCLE_BRIDGE_PORT || true
  unset LIFECYCLE_BRIDGE_URL || true
  unset LIFECYCLE_DEV || true
  unset LIFECYCLE_DEV_STATE_ROOT || true
  unset LIFECYCLE_GIT_SHA || true
  unset LIFECYCLE_REPO_ROOT || true
  unset LIFECYCLE_ROOT || true
  unset LIFECYCLE_RUNTIME_ROOT || true
}

bridge_healthy() {
  curl -fsS "http://127.0.0.1:${LIFECYCLE_BRIDGE_PORT:-52300}/health" >/dev/null 2>&1
}

control_plane_healthy() {
  curl -fsS "http://127.0.0.1:${LIFECYCLE_API_PORT:-18787}/health" >/dev/null 2>&1
}

services_healthy() {
  bridge_healthy && control_plane_healthy
}

wait_for_services() {
  local attempts=120
  local attempt

  for attempt in $(seq 1 "$attempts"); do
    if services_healthy; then
      return 0
    fi

    if [[ -n "$services_pid" ]] && ! kill -0 "$services_pid" >/dev/null 2>&1; then
      break
    fi

    sleep 0.25
  done

  printf 'dev:tui failed to start bridge/control-plane services. Log: %s\n' "$SERVICES_LOG_FILE" >&2
  tail -n 80 "$SERVICES_LOG_FILE" >&2 || true
  return 1
}

start_services_if_needed() {
  if services_healthy; then
    return 0
  fi

  mkdir -p "$DEV_LOG_DIR"
  : >"$SERVICES_LOG_FILE"

  "$ROOT_DEV_SCRIPT" desktop-services >>"$SERVICES_LOG_FILE" 2>&1 &
  services_pid="$!"
  started_services=1

  wait_for_services
}

cleanup() {
  if [[ "$started_services" -eq 1 ]] && [[ -n "$services_pid" ]]; then
    kill "$services_pid" >/dev/null 2>&1 || true
    wait "$services_pid" >/dev/null 2>&1 || true
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h|help)
      usage
      exit 0
      ;;
    --local)
      use_local_services=1
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

trap cleanup EXIT INT TERM

if [[ "$use_local_services" -eq 1 ]]; then
  load_monorepo_dev_environment
  start_services_if_needed
else
  clear_monorepo_dev_environment
fi

cd "$REPO_ROOT"
bun --watch ./apps/cli/src/index.ts
