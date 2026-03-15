import * as React from "react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const toggleGroupItemVariants = cva(
  "inline-flex cursor-pointer items-center justify-center px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors outline-none hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-[var(--surface-selected)] data-[state=on]:text-[var(--foreground)]",
  {
    variants: {
      size: {
        default: "",
        sm: "px-2.5 py-1 text-[11px]",
        lg: "px-4 py-2 text-sm",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type ToggleGroupSharedProps = Omit<
  ToggleGroupPrimitive.Props<string>,
  "defaultValue" | "multiple" | "onValueChange" | "value"
>;

type ToggleGroupSingleProps = ToggleGroupSharedProps & {
  defaultValue?: string;
  kind?: "single";
  onValueChange?: (value: string) => void;
  value?: string;
};

type ToggleGroupMultipleProps = ToggleGroupSharedProps & {
  defaultValue?: string[];
  kind: "multiple";
  onValueChange?: (value: string[]) => void;
  value?: string[];
};

type ToggleGroupProps = ToggleGroupSingleProps | ToggleGroupMultipleProps;

function ToggleGroup({
  className,
  defaultValue,
  kind = "single",
  onValueChange,
  value,
  ...props
}: ToggleGroupProps) {
  const isMultiple = kind === "multiple";
  const normalizedDefaultValue: readonly string[] | undefined =
    defaultValue === undefined
      ? undefined
      : isMultiple
        ? (defaultValue as readonly string[])
        : defaultValue
          ? [defaultValue as string]
          : [];
  const normalizedValue: readonly string[] | undefined =
    value === undefined
      ? undefined
      : isMultiple
        ? (value as readonly string[])
        : value
          ? [value as string]
          : [];

  return (
    <ToggleGroupPrimitive
      className={cn(
        "inline-flex items-center gap-1 border border-[var(--border)] bg-[var(--surface)] p-1",
        className,
      )}
      data-slot="toggle-group"
      defaultValue={normalizedDefaultValue}
      multiple={isMultiple}
      onValueChange={(nextValue) => {
        if (isMultiple) {
          (onValueChange as ((value: string[]) => void) | undefined)?.(nextValue);
          return;
        }

        (onValueChange as ((value: string) => void) | undefined)?.(nextValue[0] ?? "");
      }}
      value={normalizedValue}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  size,
  ...props
}: TogglePrimitive.Props<string> & VariantProps<typeof toggleGroupItemVariants>) {
  return (
    <TogglePrimitive
      className={cn(toggleGroupItemVariants({ className, size }))}
      data-slot="toggle-group-item"
      render={(renderProps, state) => (
        <button {...renderProps} data-state={state.pressed ? "on" : "off"} />
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
