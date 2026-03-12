# Native libghostty Sessions Must Inherit a Login-Shell Environment

Date: 2026-03-12
Milestone: M3

## Context

Lifecycle now treats the native libghostty surface as the only terminal runtime path. Native shell tabs and harness sessions both inherit the desktop app process environment, not a terminal-specific environment that is reconstructed later at launch time.

## Learning

When the desktop app starts from a GUI launcher, its initial process environment can be materially thinner than the user’s login-shell environment. That mismatch leaks directly into libghostty child processes, which means harness sessions can start with the wrong `PATH` and miss user-installed tools even though the native terminal surface itself is working correctly.

The right fix is startup-time environment hydration, not more launch shaping in the terminal command builder. The app should import a login-shell environment once during startup, before native terminal initialization and before any background terminal-adjacent work begins.

This needs to stay explicit and observable:

1. Capture a login-shell env snapshot with bounded startup timeout.
2. Merge it into the app process environment before libghostty initialization.
3. Re-apply Ghostty-specific overrides such as `TERM_PROGRAM` and `NO_COLOR` handling afterward.
4. Log success or failure as diagnostics without dumping full environment contents.

## Impact

- Native shell tabs and harness sessions now share a more realistic user toolchain environment.
- Terminal launch code should continue focusing on working directory and command semantics, not on reconstructing ambient process env.
- Startup diagnostics need to surface whether shell-env hydration succeeded, timed out, or returned malformed output.

## Follow-Up

- If users rely on exports that only exist in interactive shell rc files, evaluate whether a targeted opt-in interactive capture mode is justified.
- If terminal sessions need workspace-scoped env like service discovery vars, add that as a separate explicit contract rather than overloading startup hydration.
