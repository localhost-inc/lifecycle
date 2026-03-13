import type { KeyboardEvent } from "react";

interface CommandPaletteInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
}

export function CommandPaletteInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
}: CommandPaletteInputProps) {
  return (
    <div className="px-4 py-3.5">
      <input
        type="text"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="w-full bg-transparent text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
      />
    </div>
  );
}
