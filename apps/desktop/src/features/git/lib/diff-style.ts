export type GitDiffStyle = "split" | "unified";

export const DEFAULT_GIT_DIFF_STYLE: GitDiffStyle = "unified";
export const GIT_DIFF_STYLE_STORAGE_KEY = "lifecycle.desktop.git-diff-style";

export const GIT_DIFF_STYLE_OPTIONS: GitDiffStyle[] = ["split", "unified"];

export function isGitDiffStyle(value: unknown): value is GitDiffStyle {
  return GIT_DIFF_STYLE_OPTIONS.includes(value as GitDiffStyle);
}

export function gitDiffStyleLabel(diffStyle: GitDiffStyle): string {
  return diffStyle === "split" ? "Split" : "Unified";
}
