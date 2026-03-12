import type { FileDiffMetadata } from "@pierre/diffs/react";
import { parsePatchFiles } from "@pierre/diffs";
import { useMemo } from "react";
import { buildPatchRenderCacheKey } from "./diff-virtualization";

export function useParsedGitPatchFiles(
  cacheKeyPrefix: string,
  patch: string,
): FileDiffMetadata[] | null {
  return useMemo(() => {
    if (!patch) {
      return [];
    }

    const cacheKey = buildPatchRenderCacheKey(cacheKeyPrefix, patch);

    try {
      return parsePatchFiles(patch, cacheKey).flatMap((parsedPatch) => parsedPatch.files);
    } catch {
      return null;
    }
  }, [cacheKeyPrefix, patch]);
}
