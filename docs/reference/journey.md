# Lifecycle Journey: Local to Remote to Cloud

This document tells the canonical product story for Lifecycle.

It explains how Lifecycle should feel as a developer moves from solo local work, to remote collaboration, to an organization-visible cloud workspace. For exact command contracts and delivery scope, see [Local CLI](../plans/local-cli.md) and [Cloud Workspaces](../plans/cloud-workspaces.md).

Status note: the checked-in CLI is still converging on the canonical noun model used in this document. Today `lifecycle repo init` and `lifecycle prepare` are the shipped precursors to `lifecycle project init` and `lifecycle workspace prepare`.

## One Story, Three Modes

Lifecycle should feel like one system with three progressively richer modes:

1. local development
2. remote collaboration
3. cloud workspaces

The key rule is continuity.

`lifecycle.json` still describes the project environment. The CLI noun model stays `project -> workspace -> stack -> service`, with `context` as the aggregate read. Desktop surfaces remain additive. The product should feel like it grows with the team instead of forcing a workflow reset at each step.

## Act I: Local Development

Lifecycle should first meet developers where they already work: in a checkout, in a terminal, and without asking for sign-in before it has earned the right to exist.

A developer clones a project, installs the small `lifecycle` binary, adds or generates `lifecycle.json`, and starts working from the checkout they already have open. `lifecycle project init` gives the project a contract. `lifecycle workspace create` and `lifecycle workspace prepare` materialize a working instance. `lifecycle stack run`, `lifecycle stack status`, and `lifecycle service ...` make the stack boring to operate.

Nothing about this loop should require cloud provisioning, account setup, or a running desktop app. The workspace is private to the machine. The desktop app can attach later for richer terminal, browser, or workspace surfaces, but the CLI is the first encounter and the default control surface.

This is the fastest, most local, least ceremonial version of Lifecycle. It is the foundation the rest of the product builds on.

## Act II: Remote Collaboration

At some point the work stops being purely personal. Another person or another device needs to see what is happening. A teammate wants to inspect a preview. An agent needs a browser snapshot. Someone wants to attach to a running terminal. This is the remote phase.

Remote collaboration is about reach, not authority.

The important change is that the workspace can now be seen, inspected, or joined from somewhere else. The important non-change is that the product should not pretend the workspace has become cloud-native just because someone else is looking at it. The local workspace may still be authoritative. The project contract is still the same. The CLI still resolves the same workspace and stack.

In this phase, Lifecycle layers collaboration surfaces on top of an existing workspace: previews, browser surfaces, snapshots, attach flows, and future remote bridges or tunnels. The developer should not have to remodel the project or migrate their workflow just to let someone else look. Remote is the widening of access around a workspace, not the automatic relocation of the workspace itself.

This is where Lifecycle starts to feel collaborative while still respecting local-first authority.

## Act III: Cloud Workspaces

Eventually the work needs more than remote access. It needs durable team ownership, organization visibility, policy, shareable URLs that survive one developer's machine, and a runtime that does not depend on a laptop staying awake. This is where cloud workspaces begin.

The transition to cloud should be explicit.

The developer signs in, links the project to a repository, and either creates a cloud workspace directly or forks an existing local workspace to cloud. That cloud workspace is a new authoritative runtime at a ref. It is not a magic conversion of every local workspace into cloud authority, and signing in must not silently change where existing local work runs.

Once in cloud, the product story changes in a useful way. The workspace is visible to the organization. Preview URLs become durable team surfaces. Shared terminals become first-class collaboration. PR creation, activity, and policy all operate against an org-scoped control plane. Local workflow still matters, but cloud becomes the mode for handoff, review, pairing, and durable team execution.

## What Stays Constant

1. The project contract stays in `lifecycle.json`.
2. The CLI noun model stays `project -> workspace -> stack -> service`, with `context` as the aggregate read.
3. Desktop surfaces stay optional accelerators over the same contract.
4. Humans and agents operate on the same underlying workspace facts: stack state, service health, logs, previews, files, and browser surfaces.

## What Changes

| Dimension | Local Development | Remote Collaboration | Cloud Workspaces |
| --- | --- | --- | --- |
| Authority | local machine | same authoritative workspace as the source mode | cloud control plane plus cloud host |
| Auth | none required | scoped access may be required depending on the surface | required, org-scoped |
| Visibility | private to one machine | explicit invite, preview, attach, or shared surface | organization-visible by policy |
| Primary value | fastest iteration | bring another person or device into the loop | durable team runtime and handoff |
| Operational dependency | your machine | the authoritative workspace's host | cloud runtime and org services |

## Terminology Note

In this narrative, `remote collaboration` means access from another person or device.

It does not automatically mean `workspace.host=remote`, and it does not automatically mean `cloud`. The low-level host contract may still reserve `remote` and `cloud` as distinct placements. This document is about the product story across those phases, not the exact host enum design.

## Canonical Example

A developer clones a repo on a laptop and gets the stack healthy from the terminal. Later, they need feedback, so they expose a preview and share a remote surface with a teammate or an agent. Nothing about the project contract changes. Later still, the work needs to survive handoff, team review, and PR creation, so they fork the workspace to cloud. The same project contract now backs an org-visible cloud workspace, and the team can collaborate without depending on the original laptop.

## Relationship to Other Docs

1. [Vision](./vision.md) explains the product direction and V1 boundaries.
2. [Vocabulary](./vocabulary.md) defines the canonical terms used across the story.
3. [Workspace](./workspace.md) defines the low-level host and provider contracts.
4. [Local CLI](../plans/local-cli.md) defines the CLI command model for the local-first path.
5. [Cloud Workspaces](../plans/cloud-workspaces.md) defines the cloud delivery contract.
