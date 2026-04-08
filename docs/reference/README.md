# Reference Docs

This directory contains the canonical product and system contracts for Lifecycle.

These docs answer: what is Lifecycle, what are the core runtime boundaries, and which terms are canonical?

## Read First

1. [Vision](./vision.md) — product thesis and top-level boundaries
2. [Architecture](./architecture.md) — bridge, control plane, providers, and cloud runtime model
3. [Journey](./journey.md) — how the product should feel from local terminal work to cloud-hosted runtime
4. [Vocabulary](./vocabulary.md) — canonical terms

## Ownership

1. `vision` answers what Lifecycle is and what V1 must prove.
2. `architecture` answers how authority, clients, bridge, control plane, and providers fit together.
3. `journey` answers how the same workspace should feel across local and cloud.
4. `vocabulary` answers naming disputes.

## Runtime And UX Contracts

1. [TUI](./tui.md) — terminal UI contract, shell attach model, tmux behavior
2. [Canvas](./canvas.md) — workspace canvas and terminal-surface behavior for richer clients
3. [Ghostty Native](./ghostty-native.md) — Ghostty/AppKit integration contract for the native app

## Specialized References

1. [Agent Protocol](./agent-protocol.md) — normalized provider/OpenCode event model; secondary to the terminal-native product story
2. [Brand](./brand.md) — brand voice, visual identity, color, typography

## Usage Notes

1. `vision`, `architecture`, `journey`, and `vocabulary` are the main shared contracts.
2. `tui`, `canvas`, and `ghostty-native` are implementation-facing references for terminal and native-client work.
3. `agent-protocol` is specialized infrastructure documentation. Do not treat it as the product center.
