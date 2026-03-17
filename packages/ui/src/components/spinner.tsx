import * as React from "react";
import { LoaderCircleIcon } from "lucide-react";
import { cn } from "../lib/cn";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <LoaderCircleIcon
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      data-slot="spinner"
      role="status"
      {...props}
    />
  );
}

export { Spinner };
