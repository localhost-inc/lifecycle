#!/bin/sh
set -eu

resolve_temp_dir() {
  if [ -n "${TMPDIR:-}" ]; then
    printf '%s\n' "$TMPDIR"
    return
  fi

  if temp_dir=$(getconf DARWIN_USER_TEMP_DIR 2>/dev/null); then
    if [ -n "$temp_dir" ]; then
      printf '%s\n' "$temp_dir"
      return
    fi
  fi

  printf '%s\n' /tmp
}

TEMP_DIR=$(resolve_temp_dir)

export TMPDIR="$TEMP_DIR"
export TEMP="$TEMP_DIR"
export TMP="$TEMP_DIR"
export DARWIN_USER_TEMP_DIR="$TEMP_DIR"

exec tauri dev "$@" --config src-tauri/tauri.dev.conf.json
