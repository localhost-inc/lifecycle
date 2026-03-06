# Terminal Launch Typing

## Context

During the terminal create-flow review, we found that top-level `harness` metadata was doing too many jobs at once:

1. It identified whether a terminal was a plain shell or a harness session.
2. It encoded which harness provider should launch.
3. It influenced exit semantics and labeling in the local PTY supervisor.

That made future non-harness dynamic terminals awkward because they would either need to pretend to be a harness or introduce ad-hoc branching around a provider-specific field.

## Learning

Use an explicit terminal launch discriminator plus optional harness metadata:

1. Persist `terminal.launch_type` as the session-level launch identity.
2. Persist `terminal.harness_provider` only when `launch_type=harness`.
3. Keep `harness_session_id` as optional harness-owned resume metadata.
4. Parse launch type at the Rust boundary, but do not expose raw argv as the shared product contract.

## Milestone Impact

1. M3: terminal creation is cleaner and easier to extend beyond shell-vs-harness without changing attach/write/resize semantics.
2. M6: cloud terminals can reuse the same launch identity while resolving provider-specific process details inside the cloud provider.

## Follow-Up Actions

1. Add support for additional `launch_type` variants only when the product has a concrete dynamic terminal use case.
2. Keep provider-specific launch details behind adapter resolution instead of persisting raw command arguments on `terminal`.
