#!/usr/bin/env bash

set -euo pipefail

HOST="${LIFECYCLE_API_HOST:-127.0.0.1}"
PORT="${LIFECYCLE_API_PORT:-8787}"

if [[ "${LIFECYCLE_DEV:-}" == "1" ]]; then
  listener_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN || true)"
  if [[ -n "$listener_pids" ]]; then
    for pid in $listener_pids; do
      command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      case "$command" in
        *workerd*|*wrangler*)
          kill "$pid" >/dev/null 2>&1 || true
          parent_pid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
          if [[ -n "$parent_pid" ]]; then
            parent_command="$(ps -p "$parent_pid" -o command= 2>/dev/null || true)"
            case "$parent_command" in
              *wrangler*)
                kill "$parent_pid" >/dev/null 2>&1 || true
                ;;
            esac
          fi
          ;;
        "")
          ;;
        *)
          echo "Refusing to start control-plane dev on $HOST:$PORT; port is in use by: $command" >&2
          exit 1
          ;;
      esac
    done
    sleep 0.2
  fi
fi

exec wrangler dev --ip "$HOST" --port "$PORT"
