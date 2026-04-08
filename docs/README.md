# Docs

This directory is the documentation home for Lifecycle.

The docs are split by purpose. Start in the section that matches the question you are trying to answer instead of reading the tree top-to-bottom.

## Start Here

If you want the current product and architecture story:

1. [Vision](./reference/vision.md)
2. [Architecture](./reference/architecture.md)
3. [Journey](./reference/journey.md)
4. [TUI](./reference/tui.md)
5. [Plans](./plans/README.md)

If you want the current build lane:

1. [Plans](./plans/README.md)
2. [Milestones](./milestones/README.md)

If you are trying to understand naming:

1. [Vocabulary](./reference/vocabulary.md)

## Canonical Ownership

Use the smallest doc that answers the question instead of reading the same story in three places.

1. [Vision](./reference/vision.md) owns product thesis, promise, and V1 boundaries.
2. [Architecture](./reference/architecture.md) owns runtime authority, tier boundaries, providers, and cloud/system design.
3. [Journey](./reference/journey.md) owns the narrative of how local and cloud should feel to a developer.
4. [Plans](./plans/README.md) own concrete implementation paths and delivery sequencing.

## Doc Types

### `reference/`

Canonical product and system contracts.

Read these when you need to know what Lifecycle **is** today.

Start with:

1. [Reference Index](./reference/README.md)
2. [Vision](./reference/vision.md)
3. [Architecture](./reference/architecture.md)

### `plans/`

Tracked execution plans that are important enough to keep on paper, but are not necessarily the active milestone contract.

Read these when you need to know what we are actively building next.

Start with:

1. [Plans Index](./plans/README.md)

### `milestones/`

Active delivery contracts.

Use these only when a workstream has been promoted into a milestone. If no milestone is active, the real execution lane still lives in [plans](./plans/README.md).

### `learnings/`

Time-bound investigation notes, market research, and decisions that are not stable enough to become a reference doc yet.

Start with:

1. [Learnings Index](./learnings/README.md)

### `archive/`

Historical material that is no longer the current contract.

Use archive docs for background and archaeology, not as the current source of truth.

Start with:

1. [Archive Index](./archive/README.md)

## Reading Order By Task

### Product or architecture changes

1. [Vision](./reference/vision.md)
2. [Architecture](./reference/architecture.md)
3. [Journey](./reference/journey.md)
4. [Vocabulary](./reference/vocabulary.md)

### Terminal, TUI, or shell attach work

1. [TUI](./reference/tui.md)
2. [Architecture](./reference/architecture.md)
3. [CLI](./plans/cli.md)
4. [Terminals](./plans/terminals.md)

### Cloud runtime work

1. [Architecture](./reference/architecture.md)
2. [Journey](./reference/journey.md)
3. [Cloud](./plans/cloud.md)
4. [Cloud Hardening](./plans/cloud-hardening.md)

### Terminology or naming disputes

1. [Vocabulary](./reference/vocabulary.md)

## Rules Of Thumb

1. If a statement is a durable product or architecture contract, it belongs in `reference/`.
2. If a statement is an active implementation path, it belongs in `plans/` or `milestones/`.
3. If a note is exploratory, comparative, or time-bound, it belongs in `learnings/`.
4. If a document is no longer the current contract, move it to `archive/` instead of leaving it in the active tree.
