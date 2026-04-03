# Lifecycle Journey

This document tells the canonical product story for Lifecycle.

It explains how Lifecycle should feel as a developer moves from solo local work, to interactive agent-assisted development, to autonomous background agents and team-visible cloud workspaces. For system design see [Architecture](./architecture.md). For exact command contracts see [Local CLI](../plans/local-cli.md) and [Kin Cloud V1](../plans/kin-cloud-v1.md).

## One System, Two Modes

Lifecycle is one system with two access patterns over the same workspace contract:

1. **Interactive** — a human in a terminal, optionally running an agent
2. **Background** — an agent working autonomously, triggered by an API call or integration

The key rule is continuity. `lifecycle.json` describes the project. The CLI noun model stays `project → workspace → stack → service`. The workspace environment is identical. The difference is who is driving — a person or a prompt.

## Act I: Local Development

Lifecycle meets developers where they already work: in a checkout, in a terminal, without asking for sign-in.

A developer clones a project, installs the `lifecycle` CLI, adds or generates `lifecycle.json`, and starts working. `lifecycle workspace create` materializes a working instance. `lifecycle workspace prepare` bootstraps the environment. `lifecycle stack run` starts the services.

Nothing about this requires cloud provisioning, account setup, or a running desktop app. The workspace is private to the machine. The CLI is the first encounter and the default control surface.

This is the fastest, most local, least ceremonial version of Lifecycle.

## Act II: Interactive Agent Work

The developer opens the TUI or a terminal session inside a workspace and runs an agent. `opencode`, `claude`, `codex` — whatever tool they prefer. The agent runs inside the same workspace, uses the same filesystem, sees the same running services.

The agent gains workspace awareness through `lifecycle` CLI tools: `lifecycle context` for orientation, `lifecycle stack status` for service health, `lifecycle service info` for ports and previews. These are custom tools in OpenCode or system prompts in other agents. The integration surface is the CLI, not a custom SDK.

The TUI center panel is a tmux-backed terminal session. Lifecycle manages the workspace and stays invisible. The developer and agent share a shell.

This is where Lifecycle starts to feel like infrastructure rather than a tool.

## Act III: Background Agents

At some point the work becomes autonomous. A Slack message describes a bug. A Linear issue needs a fix. A cron job runs nightly maintenance. A teammate fires off an agent session through the web UI and walks away.

The control plane receives the prompt, provisions a cloud sandbox, starts `opencode serve` headlessly, and routes the prompt. The agent works inside a full workspace — same `lifecycle.json`, same services, same CLI tools. Events stream back to clients in real time. When the agent finishes, it pushes code and opens a PR.

No human needs to be in the loop. The workspace is a durable cloud runtime. The session state lives in the control plane. Multiple clients can watch or interact with the same session.

This is where Lifecycle becomes an orchestration platform.

## Act IV: Cloud Collaboration

Eventually the work needs team ownership. Organization visibility. Durable workspaces that survive a laptop closing. Policy. Automation.

The developer signs in, links the project to a repository, and creates a cloud workspace. That workspace is visible to the organization. Background agents can target it. PRs flow through the control plane. Activity is tracked. Automation triggers fire on events.

The transition to cloud is explicit. Signing in unlocks cloud capabilities but does not change how local workspaces work. Fork-to-cloud is the intentional handoff from private iteration to team-visible work.

## What Stays Constant

1. The project contract stays in `lifecycle.json`.
2. The CLI noun model stays `project → workspace → stack → service`, with `context` as the aggregate read.
3. The workspace environment is identical across hosts.
4. Agents gain workspace awareness through the `lifecycle` CLI — same tools, interactive or background.
5. Provider auth (Anthropic key, OpenAI key, etc.) lives inside the workspace, not in the control plane.
6. The TUI is a tmux-backed shell. It does not wrap or replace the agent experience.

## What Changes

| Dimension | Local Interactive | Background Agent | Cloud Collaboration |
|---|---|---|---|
| Who drives | Human in terminal | Prompt via API/integration | Human or agent, org-visible |
| Authority | Local machine | Control plane + sandbox | Control plane + cloud host |
| Auth | None required | API key or integration token | WorkOS org-scoped |
| Visibility | Private to one machine | Session visible to clients | Organization-visible |
| Agent runtime | `opencode` / `claude` / `codex` in shell | `opencode serve` headless | Either mode |
| Primary value | Fastest iteration | Autonomous work at scale | Durable team runtime |

## Canonical Examples

### Solo developer, local

Clone repo. `lifecycle project init`. `lifecycle workspace create`. `lifecycle stack run`. Open TUI, run `opencode` in the shell. Edit code, test, commit. Done.

### Background agent from Slack

Teammate posts "fix the flaky auth test in lifecycle-api" in Slack. Bot classifies the repo, creates a session. Control plane provisions a cloud sandbox, starts `opencode serve`, sends the prompt. Agent investigates, fixes the test, pushes a branch, opens a PR. Teammate reviews.

### Team cloud workspace

`lifecycle auth login`. `lifecycle workspace create feature --host cloud`. Multiple developers and agents work in the same cloud workspace. PRs flow through the control plane. Automation triggers run nightly. The workspace survives anyone's laptop closing.

## Relationship to Other Docs

1. [Vision](./vision.md) — product direction and V1 boundaries
2. [Architecture](./architecture.md) — system design, three tiers, sandbox providers
3. [Vocabulary](./vocabulary.md) — canonical terms
4. [TUI](./tui.md) — terminal UI contract, shell attach, tmux model
5. [Local CLI](../plans/local-cli.md) — CLI command contract
6. [Kin Cloud V1](../plans/kin-cloud-v1.md) — cloud delivery plan
