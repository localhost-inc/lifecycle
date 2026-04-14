#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OPEN_SCRIPT="$SCRIPT_DIR/open.sh"
ENV_SCRIPT="$SCRIPT_DIR/xcode-env.sh"
WATCH_DIR="$APP_DIR"
WATCH_NAME="lifecycle-desktop-dev"
DEV_RUNTIME_ROOT="${LIFECYCLE_RUNTIME_ROOT:-$("$REPO_ROOT/scripts/dev-runtime-root")}"
DEV_STATE_ROOT="${LIFECYCLE_DEV_STATE_ROOT:-$DEV_RUNTIME_ROOT/dev}"
DEV_LOG_DIR="$DEV_STATE_ROOT/logs"
DEV_PID_DIR="$DEV_STATE_ROOT/pids"
ROOT_SUPERVISOR_PID_FILE="$DEV_PID_DIR/root-supervisor.pid"
RELOAD_REQUEST_SCRIPT="$SCRIPT_DIR/request-reload.sh"
RELOAD_SEQUENCE_FILE="$DEV_STATE_ROOT/desktop-mac-reload.seq"

MODE="monorepo"
case "${1:-}" in
  ""|--monorepo)
    MODE="monorepo"
    ;;
  --services-only)
    MODE="services-only"
    ;;
  --app-only)
    MODE="app-only"
    ;;
  --help|-h)
    cat <<'EOF'
usage: dev.sh [--monorepo|--services-only|--app-only]

  --monorepo       Start bridge, control-plane, and the desktop app loop.
  --services-only  Start bridge and control-plane only.
  --app-only       Build, launch, and hot-reload the desktop app only.
EOF
    exit 0
    ;;
  *)
    echo "unknown mode: ${1}" >&2
    exit 1
    ;;
esac

mkdir -p "$DEV_LOG_DIR" "$DEV_PID_DIR"

service_log_file() {
  printf '%s/%s.log\n' "$DEV_LOG_DIR" "$1"
}

service_pid_file() {
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

write_pid_file() {
  local name="$1"
  local pid="$2"
  printf '%s\n' "$pid" >"$(service_pid_file "$name")"
}

clear_pid_file() {
  rm -f "$(service_pid_file "$1")" >/dev/null 2>&1 || true
}

process_alive() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

wait_for_pid_exit() {
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

kill_exact_pid() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  process_alive "$pid" || return 0

  kill -TERM "$pid" >/dev/null 2>&1 || true
  if ! wait_for_pid_exit "$pid" 50; then
    kill -KILL "$pid" >/dev/null 2>&1 || true
    wait_for_pid_exit "$pid" 20 || true
  fi
}

kill_process_tree() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  process_alive "$pid" || return 0

  local child=""
  while IFS= read -r child; do
    [[ -n "$child" ]] || continue
    kill_process_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)

  kill_exact_pid "$pid"
}

process_command() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

is_lifecycle_bridge_command() {
  local command="$1"
  [[ "$command" == *"lifecycle bridge start"* ]] ||
    [[ "$command" == *"/src/bridge/app.ts"* ]] ||
    [[ "$command" == *"\\src\\bridge\\app.ts"* ]]
}

kill_listeners_on_port() {
  local port="$1"
  local pid=""
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill_exact_pid "$pid"
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
}

kill_lifecycle_bridge_listeners_on_port() {
  local port="$1"
  local pid=""
  local command=""
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    command="$(process_command "$pid")"
    if [[ -n "$command" ]] && is_lifecycle_bridge_command "$command"; then
      kill_exact_pid "$pid"
    fi
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
}

remove_watchman_state() {
  watchman trigger-del "$WATCH_DIR" "$WATCH_NAME" >/dev/null 2>&1 || true
  watchman watch-del "$WATCH_DIR" >/dev/null 2>&1 || true
}

cleanup_known_dev_state() {
  local pid=""

  if pid="$(read_pid_file "$ROOT_SUPERVISOR_PID_FILE" 2>/dev/null || true)"; then
    if [[ "$pid" != "$$" ]]; then
      kill_exact_pid "$pid"
    fi
  fi
  rm -f "$ROOT_SUPERVISOR_PID_FILE" >/dev/null 2>&1 || true

  for service in bridge control-plane desktop-mac; do
    if pid="$(read_pid_file "$(service_pid_file "$service")" 2>/dev/null || true)"; then
      kill_exact_pid "$pid"
    fi
    clear_pid_file "$service"
  done

  if pid="$(read_pid_file "$(service_pid_file "desktop-mac-build")" 2>/dev/null || true)"; then
    kill_process_tree "$pid"
  fi
  clear_pid_file "desktop-mac-build"

  if pid="$(read_pid_file "$(service_pid_file "desktop-mac-app")" 2>/dev/null || true)"; then
    kill_exact_pid "$pid"
  fi
  clear_pid_file "desktop-mac-app"

  remove_watchman_state
  kill_lifecycle_bridge_listeners_on_port "${LIFECYCLE_BRIDGE_PORT:-52300}"
  kill_listeners_on_port "${LIFECYCLE_API_PORT:-18787}"
}

load_default_dev_environment() {
  while IFS='=' read -r name value; do
    [[ "$name" == LIFECYCLE_* ]] || continue
    if [[ -z "${!name:-}" ]]; then
      export "$name=$value"
    fi
  done < <("$ENV_SCRIPT")
}

run_app_only() {
  cleanup() {
    remove_watchman_state
    local build_pid=""
    if build_pid="$(read_pid_file "$(service_pid_file "desktop-mac-build")" 2>/dev/null || true)"; then
      kill_process_tree "$build_pid"
    fi
    clear_pid_file "desktop-mac-build"
    local app_pid=""
    if app_pid="$(read_pid_file "$(service_pid_file "desktop-mac-app")" 2>/dev/null || true)"; then
      kill_exact_pid "$app_pid"
    fi
    clear_pid_file "desktop-mac-app"
  }
  trap cleanup EXIT

  read_reload_sequence() {
    local current="0"
    if [[ -f "$RELOAD_SEQUENCE_FILE" ]]; then
      current="$(tr -dc '0-9' <"$RELOAD_SEQUENCE_FILE")"
    fi
    if [[ -z "$current" ]]; then
      current="0"
    fi
    printf '%s\n' "$current"
  }

  start_build() {
    "$OPEN_SCRIPT" &
    local build_pid="$!"
    write_pid_file "desktop-mac-build" "$build_pid"
    printf '%s\n' "$build_pid"
  }

  local last_handled_request=0
  local active_build_request=0
  local build_pid=""
  local build_status=0
  local build_was_canceled=0

  echo "Watching for changes in apps/desktop-mac…"

  watchman watch-del "$WATCH_DIR" >/dev/null 2>&1 || true
  watchman watch "$WATCH_DIR" >/dev/null
  cat <<EOF | watchman -j >/dev/null
["trigger", "$WATCH_DIR", {
  "name": "$WATCH_NAME",
  "expression": ["anyof",
    ["match", "Package.swift", "wholename"],
    ["allof",
      ["dirname", "Sources"],
      ["anyof",
        ["suffix", "swift"],
        ["suffix", "m"],
        ["suffix", "mm"],
        ["suffix", "c"],
        ["suffix", "h"]
      ]
    ],
    ["allof",
      ["dirname", "scripts"],
      ["suffix", "sh"]
    ],
    ["allof",
      ["dirname", "Resources"],
      ["suffix", "config"]
    ]
  ],
  "command": ["$RELOAD_REQUEST_SCRIPT"]
}]
EOF

  if ! watchman -- trigger-list "$WATCH_DIR" | grep -q "\"name\": \"$WATCH_NAME\""; then
    echo "Failed to register the desktop-mac hot reload trigger." >&2
    exit 1
  fi

  "$RELOAD_REQUEST_SCRIPT"
  echo "Building and launching…"

  build_pid="$(start_build)"
  active_build_request="$(read_reload_sequence)"

  echo "Hot reload active. Edit any Swift/ObjC file to rebuild."
  echo "Press Ctrl+C to stop."

  while true; do
    local current_request
    current_request="$(read_reload_sequence)"

    if [[ -n "$build_pid" ]] && process_alive "$build_pid"; then
      if (( current_request > active_build_request )); then
        echo "New desktop change detected; canceling stale build."
        build_was_canceled=1
        kill_process_tree "$build_pid"
      fi
      sleep 0.1
      continue
    fi

    if [[ -n "$build_pid" ]]; then
      build_status=0
      wait "$build_pid" >/dev/null 2>&1 || build_status=$?
      clear_pid_file "desktop-mac-build"

      if (( active_build_request > last_handled_request )); then
        last_handled_request="$active_build_request"
      fi

      if (( build_status != 0 && build_was_canceled == 0 )); then
        echo "Desktop build exited with code $build_status."
      fi

      build_pid=""
      active_build_request=0
      build_was_canceled=0
    fi

    if (( current_request > last_handled_request )); then
      build_pid="$(start_build)"
      active_build_request="$current_request"
      build_was_canceled=0
      echo "Starting desktop rebuild for request $active_build_request."
      continue
    fi

    sleep 0.1
  done
}

prefix_output() {
  local label="$1"
  while IFS= read -r line; do
    if [[ "$line" == "Terminated: 15" ]]; then
      continue
    fi
    printf '%s %s\n' "$label" "$line"
  done
}

run_monorepo() {
  local services_only="$1"
  local -a service_pids=()
  local -a service_names=()
  local -a service_labels=()
  local -a service_logs=()
  local -a service_commands=()
  local -a service_restart_counts=()
  local -a service_restart_window_starts=()
  local -a tail_pids=()
  local shutting_down=0

  cleanup() {
    shutting_down=1
    trap - EXIT INT TERM
    local pid=""
    for pid in "${tail_pids[@]:-}"; do
      kill -TERM "$pid" >/dev/null 2>&1 || true
    done
    for pid in "${service_pids[@]:-}"; do
      kill_exact_pid "$pid"
    done
    pkill -KILL -f 'workerd serve --binary --experimental --socket-addr=entry=127.0.0.1:18787' >/dev/null 2>&1 || true
    for pid in "${tail_pids[@]:-}"; do
      kill -KILL "$pid" >/dev/null 2>&1 || true
    done
    cleanup_known_dev_state
    for pid in "${service_pids[@]:-}"; do
      wait "$pid" >/dev/null 2>&1 || true
    done
  }

  request_stop() {
    shutting_down=1
    cleanup
    exit 130
  }

  start_service() {
    local name="$1"
    local label="$2"
    local command="$3"
    local log_file
    log_file="$(service_log_file "$name")"
    : >"$log_file"

    tail -n 0 -F "$log_file" 2>/dev/null | prefix_output "$label" &
    tail_pids+=("$!")

    service_names+=("$name")
    service_labels+=("$label")
    service_logs+=("$log_file")
    service_commands+=("$command")
    service_restart_counts+=(0)
    service_restart_window_starts+=("$(date +%s)")
  }

  launch_service_wrapper() {
    local idx="$1"
    local name="${service_names[$idx]}"
    local command="${service_commands[$idx]}"
    local log_file="${service_logs[$idx]}"

    bash -lc "$command" </dev/null >>"$log_file" 2>&1 &
    local service_pid="$!"
    service_pids[$idx]="$service_pid"
    write_pid_file "$name" "$service_pid"
  }

  trap cleanup EXIT
  trap request_stop INT TERM

  cleanup_known_dev_state
  printf '%s\n' "$$" >"$ROOT_SUPERVISOR_PID_FILE"

  local supervisor_parent_pid="$PPID"

  echo "Dev runtime: $DEV_STATE_ROOT"
  echo "Logs: $DEV_LOG_DIR"

  start_service "bridge" "lifecycle bridge:" \
    "cd \"$REPO_ROOT/apps/cli\" && exec env LIFECYCLE_DEV_SUPERVISOR=monorepo ./scripts/bridge-dev.sh"
  launch_service_wrapper 0

  start_service "control-plane" "@lifecycle/control-plane:dev:" \
    "cd \"$REPO_ROOT/apps/control-plane\" && exec ./scripts/dev.sh"
  launch_service_wrapper 1

  if [[ "$services_only" -eq 0 ]]; then
    start_service "desktop-mac" "@lifecycle/desktop-mac:dev:" \
      "exec \"$SCRIPT_DIR/dev.sh\" --app-only"
    launch_service_wrapper 2
  fi

  while true; do
    if ! kill -0 "$supervisor_parent_pid" >/dev/null 2>&1; then
      cleanup
      exit 1
    fi

    local idx
    for idx in "${!service_pids[@]}"; do
      local pid="${service_pids[$idx]}"
      if kill -0 "$pid" >/dev/null 2>&1; then
        continue
      fi

      local status=0
      wait "$pid" >/dev/null 2>&1 || status=$?
      clear_pid_file "${service_names[$idx]}"

      if (( shutting_down == 1 )); then
        continue
      fi

      local now
      now="$(date +%s)"
      local window_start="${service_restart_window_starts[$idx]}"
      local restart_count="${service_restart_counts[$idx]}"
      if (( now - window_start > 20 )); then
        window_start="$now"
        restart_count=0
      fi
      restart_count=$((restart_count + 1))
      service_restart_window_starts[$idx]="$window_start"
      service_restart_counts[$idx]="$restart_count"

      if (( restart_count > 5 )); then
        printf '%s wrapper exited with code %s too many times. Log: %s\n' \
          "${service_labels[$idx]}" \
          "$status" \
          "${service_logs[$idx]}" >&2
        while IFS= read -r line; do
          printf '%s %s\n' "${service_labels[$idx]}" "$line" >&2
        done < <(tail -n 40 "${service_logs[$idx]}" 2>/dev/null || true)
        exit "$status"
      fi

      printf '%s wrapper exited with code %s; restarting in 1s. Log: %s\n' \
        "${service_labels[$idx]}" \
        "$status" \
        "${service_logs[$idx]}" >&2
      sleep 1
      launch_service_wrapper "$idx"
    done

    sleep 0.2
  done
}

load_default_dev_environment

case "$MODE" in
  monorepo)
    run_monorepo 0
    ;;
  services-only)
    run_monorepo 1
    ;;
  app-only)
    run_app_only
    ;;
esac
