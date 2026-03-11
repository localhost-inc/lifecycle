export type GitDiffStyle = "split" | "unified";

export const DEFAULT_GIT_DIFF_STYLE: GitDiffStyle = "split";

export const GIT_DIFF_STYLE_OPTIONS: GitDiffStyle[] = ["split", "unified"];

export function gitDiffStyleLabel(diffStyle: GitDiffStyle): string {
  return diffStyle === "split" ? "Split" : "Unified";
}
