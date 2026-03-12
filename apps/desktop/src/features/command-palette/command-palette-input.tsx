import type { KeyboardEvent } from "react";

interface CommandPaletteInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export function CommandPaletteInput({ value, onChange, onKeyDown }: CommandPaletteInputProps) {
  return (
    <div className="px-4 py-3.5">
      <input
        type="text"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="Type a command or search..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="w-full bg-transparent text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
      />
    </div>
  );
}
