#!/bin/bash

if [ -n "${LIFECYCLE_CLOUD_PROFILE_READY:-}" ]; then
  return 0
fi

export LIFECYCLE_CLOUD_PROFILE_READY=1

export HOME=/home/lifecycle
mkdir -p "$HOME" 2>/dev/null || true

export TERM=xterm-256color
export COLORTERM="${COLORTERM:-truecolor}"

stty sane echo echoe echok icanon isig iexten opost onlcr 2>/dev/null || true

codex_runtime_home="/tmp/lifecycle-codex"
if [ "$(id -u)" = "0" ] && [ -d /root ]; then
  codex_runtime_home="/root/.lifecycle-codex"
fi

persist_codex_home="$HOME/.codex"
export CODEX_HOME="$codex_runtime_home"

npm_runtime_cache="/tmp/lifecycle-npm-cache"
if [ "$(id -u)" = "0" ] && [ -d /root ]; then
  npm_runtime_cache="/root/.npm"
fi
export NPM_CONFIG_CACHE="$npm_runtime_cache"
export npm_config_cache="$npm_runtime_cache"
mkdir -p "$CODEX_HOME" "$npm_runtime_cache" 2>/dev/null || true

readonly lifecycle_codex_sync_items=(
  ".codex-global-state.json"
  ".personality_migration"
  "auth.json"
  "config.toml"
  "config.toml.backup.*"
  "history.jsonl"
  "memories"
  "models_cache.json"
  "plugins"
  "rules"
  "session_index.jsonl"
  "skills"
  "sqlite"
  "state_*.sqlite*"
  "vendor_imports"
  "version.json"
)

lifecycle_copy_codex_items() {
  local source_root="$1"
  local target_root="$2"
  local pattern=""
  local source_path=""
  local relative_path=""
  local target_path=""

  mkdir -p "$source_root" "$target_root" 2>/dev/null || true
  shopt -s nullglob dotglob

  for pattern in "${lifecycle_codex_sync_items[@]}"; do
    for source_path in "$source_root"/$pattern; do
      [ -e "$source_path" ] || continue
      relative_path="${source_path#$source_root/}"
      target_path="$target_root/$relative_path"
      mkdir -p "$(dirname "$target_path")" 2>/dev/null || true
      rm -rf "$target_path" 2>/dev/null || true
      cp -R "$source_path" "$target_path" 2>/dev/null || true
    done
  done

  shopt -u nullglob dotglob
}

lifecycle_prepare_codex_home() {
  if [ -n "${LIFECYCLE_CODEX_HOME_READY:-}" ]; then
    return 0
  fi

  export LIFECYCLE_CODEX_HOME_READY=1
  lifecycle_copy_codex_items "$persist_codex_home" "$CODEX_HOME"
}

lifecycle_sync_codex_home() {
  if [ -z "${LIFECYCLE_CODEX_HOME_READY:-}" ]; then
    return 0
  fi

  lifecycle_copy_codex_items "$CODEX_HOME" "$persist_codex_home"
}

lifecycle_run_codex() {
  lifecycle_prepare_codex_home
  command codex -c 'check_for_update_on_startup=false' "$@"
  local status=$?
  lifecycle_sync_codex_home
  return "$status"
}

lifecycle_launch_claude() {
  if claude auth status --text >/dev/null 2>&1; then
    command claude
  else
    command claude auth login && command claude
  fi
}

lifecycle_launch_codex() {
  if codex login status >/dev/null 2>&1; then
    codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen
  else
    codex login --device-auth && codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen
  fi
}

codex() {
  lifecycle_run_codex "$@"
}

export -f lifecycle_copy_codex_items
export -f lifecycle_launch_claude
export -f lifecycle_launch_codex
export -f lifecycle_prepare_codex_home
export -f lifecycle_sync_codex_home
export -f lifecycle_run_codex
export -f codex

export PS1='[cloud] \u@\h:\w\$ '
export PROMPT_COMMAND=''

if [ -n "${LIFECYCLE_WORKSPACE_ID:-}" ] && [ -d /workspace ]; then
  cd /workspace || true
fi

# Auto-attach: the CLI writes a tmux session name to this trigger file
# during a setup phase, then opens a second SSH connection.  On shell
# start we read the trigger, remove it (one-shot), and attach to the
# named tmux session.
if [ -f /tmp/.lifecycle-tmux-attach ]; then
  _session=$(cat /tmp/.lifecycle-tmux-attach)
  rm -f /tmp/.lifecycle-tmux-attach
  if tmux has-session -t "$_session" 2>/dev/null; then
    exec tmux attach-session -t "$_session"
  fi
fi
