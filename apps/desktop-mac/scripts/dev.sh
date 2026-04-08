#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OPEN_SCRIPT="$SCRIPT_DIR/open.sh"
ENV_SCRIPT="$SCRIPT_DIR/xcode-env.sh"
WATCH_DIR="$APP_DIR"
WATCH_NAME="lifecycle-macos-dev"

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
    watchman trigger-del "$WATCH_DIR" "$WATCH_NAME" >/dev/null 2>&1 || true
    watchman watch-del "$WATCH_DIR" >/dev/null 2>&1 || true
    pkill -f lifecycle-macos >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  echo "Building and launching…"
  "$OPEN_SCRIPT"
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
  "command": ["$OPEN_SCRIPT"]
}]
EOF

  if ! watchman -- trigger-list "$WATCH_DIR" | grep -q "\"name\": \"$WATCH_NAME\""; then
    echo "Failed to register the desktop-mac hot reload trigger." >&2
    exit 1
  fi

  echo "Hot reload active. Edit any Swift/ObjC file to rebuild."
  echo "Press Ctrl+C to stop."

  while true; do
    sleep 86400
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
  local runtime_dir
  runtime_dir="$(mktemp -d -t lifecycle-desktop-dev.XXXXXX)"
  local stop_file="$runtime_dir/stop"
  local -a supervisor_pids=()
  local -a service_pid_files=()

  read_pid_file() {
    local pid_file="$1"
    [[ -f "$pid_file" ]] || return 1

    local pid=""
    pid="$(tr -d '[:space:]' <"$pid_file" 2>/dev/null || true)"
    [[ -n "$pid" ]] || return 1
    printf '%s\n' "$pid"
  }

  signal_tracked_service() {
    local signal="$1"
    local pid_file="$2"
    local pid=""

    pid="$(read_pid_file "$pid_file" 2>/dev/null || true)"
    [[ -n "$pid" ]] || return 0
    kill "-$signal" "$pid" >/dev/null 2>&1 || true
  }

  cleanup() {
    trap - EXIT INT TERM
    : >"$stop_file"
    local pid_file
    for pid_file in "${service_pid_files[@]:-}"; do
      signal_tracked_service TERM "$pid_file"
    done
    local pid
    for pid in "${supervisor_pids[@]:-}"; do
      kill -TERM "$pid" >/dev/null 2>&1 || true
    done
    sleep 0.3
    for pid_file in "${service_pid_files[@]:-}"; do
      signal_tracked_service KILL "$pid_file"
    done
    watchman trigger-del "$WATCH_DIR" "$WATCH_NAME" >/dev/null 2>&1 || true
    watchman watch-del "$WATCH_DIR" >/dev/null 2>&1 || true
    for pid in "${supervisor_pids[@]:-}"; do
      kill -KILL "$pid" >/dev/null 2>&1 || true
    done
    pkill -KILL -f 'workerd serve --binary --experimental --socket-addr=entry=127.0.0.1:18787' >/dev/null 2>&1 || true
    pkill -KILL -f 'lifecycle-macos' >/dev/null 2>&1 || true
    for pid in "${supervisor_pids[@]:-}"; do
      wait "$pid" >/dev/null 2>&1 || true
    done
    rm -rf "$runtime_dir" >/dev/null 2>&1 || true
  }

  request_stop() {
    cleanup
    exit 130
  }

  run_supervised() {
    local name="$1"
    local label="$2"
    local command="$3"
    local pid_file="$runtime_dir/$name.pid"
    local output_pipe="$runtime_dir/$name.pipe"

    (
      trap 'exit 0' TERM INT
      while true; do
        set +e
        rm -f "$pid_file" "$output_pipe"
        mkfifo "$output_pipe"

        prefix_output "$label" <"$output_pipe" &
        local prefix_pid=$!

        bash -lc "$command" >"$output_pipe" 2>&1 &
        local child_pid=$!
        printf '%s\n' "$child_pid" >"$pid_file"

        wait "$child_pid"
        local status=$?
        rm -f "$pid_file"
        wait "$prefix_pid" >/dev/null 2>&1 || true
        rm -f "$output_pipe"
        set -e

        if [[ -s "$stop_file" ]]; then
          exit 0
        fi

        printf '%s process exited with code %s; restarting in 1s\n' "$label" "$status" >&2
        sleep 1
      done
    ) &

    supervisor_pids+=("$!")
    service_pid_files+=("$pid_file")
  }

  trap cleanup EXIT
  trap request_stop INT TERM

  run_supervised "bridge" "@lifecycle/bridge:dev:" \
    "cd \"$REPO_ROOT/packages/bridge\" && exec ./scripts/dev.sh"

  run_supervised "control-plane" "@lifecycle/control-plane:dev:" \
    "cd \"$REPO_ROOT/apps/control-plane\" && exec ./scripts/dev.sh"

  if [[ "$services_only" -eq 0 ]]; then
    run_supervised "desktop-mac" "@lifecycle/desktop-mac:dev:" \
      "\"$SCRIPT_DIR/dev.sh\" --app-only"
  fi

  wait
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
