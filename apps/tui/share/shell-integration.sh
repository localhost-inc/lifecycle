#!/bin/bash
# Lifecycle TUI — shell integration (OSC 133)
#
# Emits semantic escape sequences so the TUI sidebar can detect when a
# command is running. These travel transparently through tmux.
#
#   133;A — prompt start  (shell idle)
#   133;B — command start (user hit enter)
#   133;D — command end   (command finished)
#
# Source this file in .bashrc/.zshrc, or let the TUI inject it
# automatically via tmux session environment.

if [ -n "${LIFECYCLE_SHELL_INTEGRATION_LOADED:-}" ]; then
  return 0 2>/dev/null || true
fi
export LIFECYCLE_SHELL_INTEGRATION_LOADED=1

_lc_osc133_prompt() {
  printf '\033]133;D\a\033]133;A\a'
}

_lc_osc133_preexec() {
  printf '\033]133;B\a'
}

# ── bash ──
if [ -n "${BASH_VERSION:-}" ]; then
  _lc_osc133_debug_guard=0
  trap '
    if [ "$_lc_osc133_debug_guard" -eq 0 ]; then
      _lc_osc133_debug_guard=1
      _lc_osc133_preexec
    fi
  ' DEBUG
  # Prepend to existing PROMPT_COMMAND so we don't clobber user config.
  PROMPT_COMMAND="_lc_osc133_debug_guard=0; _lc_osc133_prompt${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
  return 0 2>/dev/null || true
fi

# ── zsh ──
if [ -n "${ZSH_VERSION:-}" ]; then
  autoload -Uz add-zsh-hook 2>/dev/null
  _lc_zsh_preexec() { _lc_osc133_preexec; }
  _lc_zsh_precmd()  { _lc_osc133_prompt; }
  add-zsh-hook preexec _lc_zsh_preexec
  add-zsh-hook precmd  _lc_zsh_precmd
  return 0 2>/dev/null || true
fi
