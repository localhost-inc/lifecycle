import type {
  AgentWorker,
  AgentWorkerEvent,
  AgentWorkerSnapshot,
  AgentSessionContext,
} from "@lifecycle/agents";
import type { AgentSessionRecord } from "@lifecycle/contracts";
import { createLocalWorker } from "./local";

export interface CreateWorkerOptions {
  session: AgentSessionRecord;
  context: AgentSessionContext;
  onState: (snapshot: AgentWorkerSnapshot) => void | Promise<void>;
  onWorkerEvent: (event: AgentWorkerEvent) => void | Promise<void>;
}

export interface CreateWorkerResult {
  session: AgentSessionRecord;
  worker: AgentWorker;
}

export async function createWorker(
  options: CreateWorkerOptions,
): Promise<CreateWorkerResult> {
  // TODO: dispatch based on context.host when remote/cloud workers are added
  return createLocalWorker(options);
}
