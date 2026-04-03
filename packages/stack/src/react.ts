import { createContext, createElement, useContext, type PropsWithChildren } from "react";
import type { StackClient, StackClientRegistry } from "./client";

const StackClientRegistryContext = createContext<StackClientRegistry | null>(null);
const StackClientContext = createContext<StackClient | null>(null);

export function StackClientRegistryProvider({
  stackClientRegistry,
  children,
}: PropsWithChildren<{
  stackClientRegistry: StackClientRegistry;
}>) {
  return createElement(
    StackClientRegistryContext.Provider,
    { value: stackClientRegistry },
    children,
  );
}

export function useStackClientRegistry(): StackClientRegistry {
  const value = useContext(StackClientRegistryContext);
  if (!value) {
    throw new Error("StackClientRegistryProvider is required");
  }

  return value;
}

export function StackClientProvider({
  stackClient,
  children,
}: PropsWithChildren<{
  stackClient: StackClient;
}>) {
  return createElement(StackClientContext.Provider, { value: stackClient }, children);
}

export function useStackClient(): StackClient {
  const stackClient = useContext(StackClientContext);
  if (!stackClient) {
    throw new Error("StackClientProvider is required");
  }

  return stackClient;
}
