# File Viewer Surface Renderers

## Context

The workspace surface already had a durable split between runtime tabs and document tabs, but adding a new surface kind still required threading custom state and rendering logic through several places manually. We needed to prove that a real file-backed document could live on that path without inventing another navigation model or letting React read the filesystem directly.

## Learning

1. A file viewer fits the existing document-tab contract cleanly when its identity is the normalized repo-relative path (`file:<path>`).
2. File reads should still cross the native/provider boundary even for local workspaces. Reusing the workspace path resolver kept repo-relative authority checks in one place and avoided direct frontend filesystem access.
3. Extension-specific rendering should be optional composition on top of the shared file tab, not separate surface kinds:
   - Markdown can render as rich document content
   - Pencil `.pen` files can render as structured document summaries over the JSON payload
   - plain text remains the default fallback
4. “Open file” affordances inside the Changes tab, diff surfaces, and PR surfaces become much more useful when they target a workspace-owned file tab instead of immediately handing off to the OS.

## Milestone Impact

1. M3: validates that future file-oriented workspace documents can reuse the shared surface contract without disturbing terminal runtime semantics.
2. M6: keeps room for provider-backed file reads later because the UI now depends on a workspace file contract, not direct local path access.

## Follow-Up Actions

1. Move document-kind branching toward a registry so new surface kinds do not require touching reducer, persistence, icons, and panel rendering separately.
2. Add richer file renderers over time (images, richer Pencil rendering, eventual editable text/code surfaces) without forking the tab model.
3. Decide which file mutations should invalidate or live-refresh open file-viewer tabs once editable surfaces arrive.
