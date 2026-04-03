# Lifecycle Vision

Lifecycle is the workspace runtime and agent orchestration platform for software teams.

It manages the full lifecycle of development workspaces across local machines, containers, remote servers, and cloud sandboxes. It provides the infrastructure for both interactive development and autonomous background agent work — through the same project contract, the same CLI, and the same workspace environments.

## Problem

Development environments fail in predictable ways:

1. Setup is slow and non-deterministic.
2. Runtime state drifts and becomes hard to recover.
3. Agent tooling is fragmented — every agent needs its own sandbox, its own environment setup, its own integration glue.
4. There is no unified way to run an agent interactively in your terminal and also run agents autonomously in the background against the same workspace contract.
5. Teams lose time not because they cannot write code, but because getting and keeping a healthy workspace is unreliable.

## Product Thesis

1. A project plus `lifecycle.json` is enough to produce a reproducible workspace on any host.
2. The `lifecycle` CLI is the primary control surface: small, distributable, scriptable.
3. Workspaces run on `local`, `docker`, `remote`, or `cloud` hosts through pluggable sandbox providers.
4. Interactive and background are access patterns, not different systems. Same workspace, same contract, two ways in.
5. Lifecycle is agent-agnostic infrastructure — where agents run, not which agent to use. OpenCode is the default agent runtime. Claude, Codex, or any other agent works inside the same workspace.
6. Local-first operation works without auth or network. Cloud unlocks background agents, team visibility, and durable workspaces.
7. The TUI is a tmux-backed shell for interactive work. The control plane API is for background agents and integrations.

## Product Promise

1. Start quickly — workspace from project contract, any host.
2. Recover predictably — typed lifecycle transitions, no drift.
3. Run agents anywhere — interactive in your terminal, background through the API.
4. Hand off cleanly — same workspace backs a human, an agent, or both.

## Two Modes

### Interactive

A developer shells into a workspace through the TUI or terminal. They run `opencode`, `claude`, `codex`, or plain shell commands inside a tmux session. Lifecycle manages the workspace and stays invisible.

### Background

An agent runs headlessly inside a sandbox. Prompts arrive from Slack, Linear, GitHub, a web client, or the API. The control plane manages session state, prompt queuing, and real-time streaming. Results flow back to clients without a human in the loop.

Both modes share the same `lifecycle.json`, the same workspace environment, the same CLI tools, and the same service graph.

## Core V1 Loop

### Interactive path

1. Add `lifecycle.json` to the project, or generate with `lifecycle project init`.
2. `lifecycle workspace create` — materialize a workspace on any host.
3. `lifecycle workspace prepare` — bootstrap the environment.
4. `lifecycle stack run` — start the service graph.
5. Shell into the workspace. Run `opencode` or any agent. Write code.
6. `lifecycle pr create` — ship the work.

### Background path

1. Same project contract, same workspace provisioning.
2. Agent session starts through the API — triggered by Slack message, Linear issue, GitHub event, cron schedule, or direct API call.
3. Control plane provisions a sandbox, starts `opencode serve`, and routes the prompt.
4. Agent works autonomously. Events stream to clients in real time.
5. Agent pushes code and creates a PR. Human reviews.

### What stays constant

1. `lifecycle.json` is the project contract.
2. The CLI noun model is `project → workspace → stack → service`, with `context` as the aggregate read.
3. Workspace lifecycle transitions are explicit, typed, and observable.
4. The agent gains workspace awareness through the same `lifecycle` CLI tools a human uses.
5. Provider auth lives inside the workspace, not in the control plane.

## Architecture

Three tiers: clients, control plane, sandbox providers.

See [Architecture](./architecture.md) for the full system design.

## Host Model

| Host | Description | Use Case |
|---|---|---|
| `local` | Developer's machine | Fastest feedback. No account needed. |
| `docker` | Local container | Isolation. Reproducible environments. |
| `remote` | SSH / Daytona | Persistent remote devboxes. Team sharing. |
| `cloud` | Modal | Background agents. Scale. Fire-and-forget. |

All hosts run the same workspace contract. A workspace created locally can be forked to cloud. A background agent in a cloud sandbox uses the same `lifecycle.json` and CLI tools as a developer on their laptop.

## Local and Cloud Model

### Local mode

1. No account required.
2. State is stored locally.
3. Workspaces are private to the machine.
4. Fastest feedback loop.
5. Interactive mode: TUI and terminal.

### Cloud mode

1. Enabled by sign-in.
2. Organization-scoped visibility and activity.
3. Background agent sessions through the control plane.
4. Automation triggers: Slack, Linear, GitHub, cron, webhooks.
5. Durable workspaces that survive laptop sleep.
6. PR and collaboration workflows.

### Bridge: fork-to-cloud

Fork-to-cloud is the intentional handoff from private local work to team-visible cloud workspace. Signing in unlocks cloud capabilities but does not change the authority of existing local workspaces.

## V1 Outcomes

A successful V1 means:

1. `lifecycle.json` plus the CLI produces a running workspace on local, docker, remote, or cloud hosts.
2. A developer can shell into any workspace and run an agent interactively.
3. A background agent can be launched through the API and work autonomously in a cloud sandbox.
4. Workspace lifecycle transitions are explicit, tested, and observable across all hosts.
5. The control plane manages sessions, prompt queuing, and real-time event streaming.
6. PR creation and merge work through the control plane without shell-local credentials.

## Principles

1. Local-first by default.
2. Agent-agnostic infrastructure — where agents run, not which agent.
3. Same workspace contract, interactive or background.
4. Typed state machines over ad-hoc transitions.
5. Explicit provider and host boundaries.
6. Control plane orchestrates. Sandboxes execute.
7. No silent fallbacks. Failures are typed with recovery guidance.

## Non-Goals (V1)

1. Full IDE replacement.
2. Forcing cloud auth for local workflows.
3. Building a custom agent runtime — OpenCode and existing agent CLIs handle this.
4. Desktop app as a primary surface — CLI, API, and TUI come first.

## Delivery Alignment

1. [Architecture](./architecture.md) — system design
2. [Journey](./journey.md) — narrative across modes
3. [Local CLI](../plans/local-cli.md) — CLI command contract
4. [Kin Cloud V1](../plans/kin-cloud-v1.md) — cloud delivery plan
5. [Milestones](../milestones/README.md) — active delivery contracts
6. [AGENTS.md](../../AGENTS.md) — engineering workflow and quality bar
