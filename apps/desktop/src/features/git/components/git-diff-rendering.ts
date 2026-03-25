import type { FileDiffMetadata } from "@pierre/diffs/react";

export const COPYABLE_GIT_DIFF_CSS = `
[data-code],
[data-line],
[data-column-content],
[data-column-content] span,
[data-diff-span] {
  -webkit-user-select: text;
  user-select: text;
}
[data-separator] {
  display: none;
}
[data-diffs] {
  --diffs-font-size: 12px;
}
`;

type CopyableDiffOptions = Record<string, unknown> & {
  unsafeCSS?: string;
};

export function withCopyableGitDiffOptions<T extends CopyableDiffOptions>(
  options: T,
): T & { unsafeCSS: string } {
  const unsafeCSS =
    options.unsafeCSS && options.unsafeCSS.length > 0
      ? `${options.unsafeCSS}\n${COPYABLE_GIT_DIFF_CSS}`
      : COPYABLE_GIT_DIFF_CSS;

  return {
    ...options,
    unsafeCSS,
  };
}

export function getOpenableDiffFilePath(fileDiff: FileDiffMetadata): string | null {
  if (fileDiff.type === "deleted") {
    return null;
  }

  return fileDiff.name;
}
