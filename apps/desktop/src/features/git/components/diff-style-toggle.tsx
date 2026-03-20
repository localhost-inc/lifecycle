import { FloatingToggle } from "@lifecycle/ui";
import { GIT_DIFF_STYLE_OPTIONS, gitDiffStyleLabel, type GitDiffStyle } from "@/features/git/lib/diff-style";

interface DiffStyleToggleProps {
  diffStyle: GitDiffStyle;
  disabled: boolean;
  onChange: (nextDiffStyle: GitDiffStyle) => void;
}

export function DiffStyleToggle({ diffStyle, disabled, onChange }: DiffStyleToggleProps) {
  return (
    <FloatingToggle
      ariaLabel="Diff view mode"
      disabled={disabled}
      onValueChange={onChange}
      options={GIT_DIFF_STYLE_OPTIONS.map((option) => ({
        ariaLabel: gitDiffStyleLabel(option),
        content: gitDiffStyleLabel(option),
        itemClassName: "min-w-[76px] px-3 py-2",
        value: option,
      }))}
      value={diffStyle}
    />
  );
}
