import * as React from "react";
import { cn } from "../lib/cn";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      aria-label="Loading"
      className={cn("size-4", className)}
      data-slot="spinner"
      fill="none"
      role="status"
      viewBox="0 0 24 24"
      {...props}
    >
      <circle
        className="lifecycle-motion-spin"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeDasharray="48 16"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export { Spinner };
