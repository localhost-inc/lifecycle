# Base UI Compatibility Boundary - 2026-03-08

## Context

`packages/ui` had adopted several shadcn primitives on top of Radix. We needed to move the shared package to shadcn's Base UI direction without forcing a broad desktop rewrite at the same time.

## Observation

The riskiest migration cost was not styling. It was API drift:

1. `Button` and `TooltipTrigger` relied on `asChild`.
2. `Collapsible`, `Tabs`, and `ToggleGroup` consumers relied on Radix-style `data-state` selectors.
3. `ToggleGroup` consumers used the Radix `type="single"` contract, while Base UI models selection as arrays plus `multiple`.
4. `Select` consumers expected the Radix single-value callback shape (`onValueChange(value: string)`), while Base UI allows `null`.

## Decision

1. Move all Radix-backed shared primitives in `packages/ui` to `@base-ui/react`.
2. Keep the desktop-facing wrapper API stable where that avoids churn:
   - preserve `asChild` on `Button`, `TooltipTrigger`, and `CollapsibleTrigger`
   - reintroduce Radix-style `data-state` markers on top of Base UI state where consumers already depend on them
   - keep `ToggleGroup type="single"` semantics at the wrapper layer
   - normalize `Select` back to a non-null single-value callback for current consumers
3. Treat the wrapper layer as the compatibility boundary. Desktop features should consume `@lifecycle/ui`, not Base UI primitives directly.

## Milestone Impact

1. M3: terminal, git, and workspace surfaces can adopt the Base UI primitive stack without another feature-level refactor.
2. M5: lifecycle and observability panels can keep composing shared primitives while the implementation detail underneath stays replaceable.
3. M6: future CLI or web clients can reuse the same stable `@lifecycle/ui` contracts instead of inheriting library-specific behavior.

## Follow-up actions

1. Keep new shared primitives in `packages/ui` and decide explicitly whether the wrapper should expose raw Base UI behavior or a Lifecycle-stable compatibility surface.
2. Add regression tests whenever a wrapper preserves compatibility behavior that Base UI does not provide by default.
3. Avoid importing `@base-ui/react/*` directly from app code so future primitive swaps remain package-local.
