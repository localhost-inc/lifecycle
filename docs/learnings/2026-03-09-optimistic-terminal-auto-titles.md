# Terminal Auto Title Fallbacks

## Context

Generated terminal titles depend on an external model call, which can fail or time out. The product still needs a deterministic tab title when that happens, but intermediary tab-label churn is distracting when generation succeeds.

## Learning

1. Terminal tab titles should prefer the generated title and only fall back when generation fails.
   - Skipping an intermediary title avoids visible tab-label churn on successful runs.
   - When generation fails, a truncated prompt is a better fallback than a keyword-derived heuristic because it mirrors the user intent directly.
2. Workspace renames should remain on the final generated path.
   - Generated workspace names can trigger worktree-path updates, so they should not churn through multiple optimistic values.
3. Auto-title latency needs info-level timing logs.
   - Prompt detection, generator completion, failure fallback, and final title application should all be observable without enabling debug logging.

## Milestone Impact

1. M3 harness tabs now avoid unnecessary title transitions while still producing a deterministic name when generation fails.
2. Diagnostics now make title-generation latency debuggable in production-like desktop runs.

## Follow-Up Actions

1. If the model path is still too slow in practice, consider lowering the timeout or using a smaller dedicated titling model.
2. If failure fallback titles need more control, add a product-level formatter for prompt truncation instead of reintroducing optimistic title churn.
