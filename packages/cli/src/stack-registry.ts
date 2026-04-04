import { createStackClientRegistry, type StackClientRegistry } from "@lifecycle/stack";
import { LocalStackClient } from "@lifecycle/stack/internal/local";

let registry: StackClientRegistry | null = null;

export function getStackClientRegistry(): StackClientRegistry {
  if (!registry) {
    registry = createStackClientRegistry({
      local: new LocalStackClient(),
    });
  }

  return registry;
}
