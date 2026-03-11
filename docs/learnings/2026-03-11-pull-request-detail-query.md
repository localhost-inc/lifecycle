# Pull Request Detail Query

## Learning

1. Repository pull request lists are useful for discovery, but they are the wrong contract to power the pull request document surface on their own.
2. The workspace document view needs a provider-backed fetch-by-number detail query so any opened pull request can hydrate its latest review and check-run state without depending on the currently checked out branch.
3. Including check rollups in list payloads is still worthwhile because document snapshots and repository rails should not discard already-available check metadata.

## Why It Matters

1. This prevents PR document tabs from showing permanently empty checks for non-current-branch pull requests.
2. It keeps persisted document snapshots resilient while allowing the live surface to refresh into richer provider detail as soon as it mounts.

## Milestone Impact

1. M6 pull request workflows now have a reliable detail path for review and check visibility inside the center workspace surface.

## Follow-up

1. If PR detail surfaces expand into reviews, timelines, or comments, extend the dedicated detail query instead of overloading the repository list contract.
