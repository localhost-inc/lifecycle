# Lifecycle Journey

This document tells the product story for Lifecycle.

Unlike [Vision](./vision.md), this is not the place for the full product thesis or system contract. It exists to answer one question:

**what should Lifecycle feel like as work moves from a local terminal to a cloud-hosted runtime?**

For the durable contract, read:

1. [Vision](./vision.md)
2. [Architecture](./architecture.md)
3. [TUI](./tui.md)

## The Through-Line

Lifecycle should feel like one workspace runtime with one shell model.

`lifecycle.json` describes the project. The CLI noun model stays `project → workspace → stack → service`. The shell, files, and running services stay coherent as the workspace moves between hosts.

The thing that changes is access:

1. locally, the developer is in the terminal
2. in cloud, the same workspace is hosted remotely
3. when needed, a routable `opencode serve` endpoint is layered on top of that runtime for compatible remote harnesses

Lifecycle should not force the user to learn a second product model when they leave the laptop.

## Act I: Local Development

Lifecycle meets developers in a checkout, in a terminal, without asking for sign-in.

The developer clones a project, installs the `lifecycle` CLI, adds or generates `lifecycle.json`, and starts working:

1. `lifecycle project init`
2. `lifecycle workspace create`
3. `lifecycle workspace prepare`
4. `lifecycle stack run`

Then they open the TUI or attach a shell and work directly inside the workspace.

This is the fastest, least ceremonial version of Lifecycle.

## Act II: Terminal-First Tool Use

The developer uses the workspace from a tmux-backed terminal session.

They might run:

1. `opencode`
2. `claude`
3. `codex`
4. plain shell commands

Lifecycle does not try to replace that tool experience. It provides the runtime those tools operate inside.

Those tools learn workspace state through the same CLI the human uses:

1. `lifecycle context`
2. `lifecycle stack status`
3. `lifecycle service info`

This is the core product feel: the shell is the primary interface, and Lifecycle is the runtime beneath it.

## Act III: Cloud Continuation

When the work needs to leave the laptop, the workspace should keep the same shape.

The control plane provisions a cloud sandbox, restores the same workspace contract, starts remote tmux-backed shell attach, and optionally starts `opencode serve` headlessly.

From the user's point of view:

1. the same workspace now runs remotely
2. they can still attach a shell
3. they can still use the same CLI tools
4. a compatible remote harness can be pointed at the hosted `opencode serve` endpoint

The workspace remains the center. The routed endpoint is an integration surface layered on top.

## Act IV: Cloud Collaboration

Eventually the work needs team ownership, visibility, policy, and durability.

The developer signs in, links the repository, and creates a cloud workspace. That workspace becomes team-visible. Teammates can inspect status, previews, and runtime health, attach shells when needed, and use the same hosted harness endpoint against the same runtime.

This is the handoff from private local iteration to team-visible cloud runtime. It should feel like an upgrade of the same workspace, not a jump into a different system.

## Canonical Examples

### Solo developer, local

Clone repo. `lifecycle project init`. `lifecycle workspace create`. `lifecycle stack run`. Open TUI, run `opencode` in the shell. Edit code, test, commit. Done.

### Remote harness on a cloud workspace

Developer creates a cloud workspace for the repo. Control plane provisions the sandbox, starts remote tmux attach plus `opencode serve`, and returns the endpoint. The developer attaches a shell from one machine and points a compatible harness at the hosted endpoint from another. Both see the same files and running services.

### Team cloud workspace

`lifecycle auth login`. `lifecycle workspace create feature --host cloud`. Multiple developers work in the same cloud workspace. Teammates inspect status and previews, attach shells when needed, and remote harnesses route through the same hosted endpoint. The workspace survives anyone's laptop closing.

## Relationship to Other Docs

1. [Vision](./vision.md) — product thesis and V1 boundaries
2. [Architecture](./architecture.md) — system design and authority boundaries
3. [TUI](./tui.md) — terminal UI contract
4. [CLI](../plans/cli.md) — command contract
5. [Cloud](../plans/cloud.md) — cloud delivery plan
