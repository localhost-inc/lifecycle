# Diff Viewer Virtualization

## Context

The redesigned git diff viewer introduced a much better multi-file reading model, but it also changed the render shape from isolated file cards to one long scroll surface with sticky file headers and a synchronized file tree.

That meant a moderate patch could eagerly mount dozens of `@pierre/diffs/react` `FileDiff` instances at once. Each mounted instance hydrates its own diff renderer and DOM subtree, so load time and scroll quality degraded quickly as file count and patch size increased.

## Learning

1. For diff viewing, the dominant cost is mounted diff bodies, not sidebar chrome.
2. `FileDiff` virtualization has to preserve per-file UI state outside the row component, otherwise offscreen unmounts will reset collapse state.
3. A measured spacer-based window is a good fit here because it keeps sticky headers in normal document flow while still limiting mounted rows.
4. Height estimation does not need to be perfect if visible rows report measured heights back into the layout quickly.
5. Once rows can unmount, diff renderer cache keys matter because remount churn otherwise pays the highlight cost repeatedly.
6. The `@pierre/diffs` worker-pool path is worth enabling at the viewer surface boundary so virtualized remounts reuse cached ASTs instead of pushing highlight work back onto the main thread.
7. File-specific diff entry points do not need a separate renderer if the primary viewer can accept an initial focus path and scroll itself to the relevant section after loading the full scope patch.

## Milestone Impact

1. M6: git observability surfaces can support larger working tree and commit diffs without regressing local interaction quality.
2. M7: the same measured-window pattern can be reused for other long, sectioned workspace surfaces where sticky headers matter.
3. M6: working tree change clicks can stay lightweight tab intents while the diff surface remains unified around one multi-file renderer.

## Follow-up

1. If very large change lists still stress the sidebar, virtualize the file tree rows with the same measured-window approach.
2. If patch parsing becomes the next bottleneck, move `parsePatchFiles` off the main thread rather than widening the current eager parse path.
3. If single-file mega-diffs remain janky after worker offload, evaluate line-level windowing or an adaptive low-detail mode for extreme files.
