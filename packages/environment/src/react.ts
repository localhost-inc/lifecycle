import { createContext, createElement, useContext, type PropsWithChildren } from "react";
import type { EnvironmentClient, EnvironmentClientRegistry } from "./client";

const EnvironmentClientRegistryContext = createContext<EnvironmentClientRegistry | null>(null);
const EnvironmentClientContext = createContext<EnvironmentClient | null>(null);

export function EnvironmentClientRegistryProvider({
  environmentClientRegistry,
  children,
}: PropsWithChildren<{
  environmentClientRegistry: EnvironmentClientRegistry;
}>) {
  return createElement(
    EnvironmentClientRegistryContext.Provider,
    { value: environmentClientRegistry },
    children,
  );
}

export function useEnvironmentClientRegistry(): EnvironmentClientRegistry {
  const value = useContext(EnvironmentClientRegistryContext);
  if (!value) {
    throw new Error("EnvironmentClientRegistryProvider is required");
  }

  return value;
}

export function EnvironmentClientProvider({
  environmentClient,
  children,
}: PropsWithChildren<{
  environmentClient: EnvironmentClient;
}>) {
  return createElement(EnvironmentClientContext.Provider, { value: environmentClient }, children);
}

export function useEnvironmentClient(): EnvironmentClient {
  const environmentClient = useContext(EnvironmentClientContext);
  if (!environmentClient) {
    throw new Error("EnvironmentClientProvider is required");
  }

  return environmentClient;
}
