import { createContext, useContext, type PropsWithChildren } from "react";
import type { AgentOrchestrator } from "@lifecycle/agents";

const AgentOrchestratorContext = createContext<AgentOrchestrator | null>(null);

export function AgentOrchestratorProvider({
  agentOrchestrator,
  children,
}: PropsWithChildren<{
  agentOrchestrator: AgentOrchestrator;
}>) {
  return (
    <AgentOrchestratorContext.Provider value={agentOrchestrator}>
      {children}
    </AgentOrchestratorContext.Provider>
  );
}

export function useAgentOrchestrator(): AgentOrchestrator {
  const agentOrchestrator = useContext(AgentOrchestratorContext);
  if (!agentOrchestrator) {
    throw new Error("AgentOrchestratorProvider is required");
  }

  return agentOrchestrator;
}
