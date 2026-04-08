import type { LifecycleEvent, LifecycleEventKind, LifecycleEventOf } from "@lifecycle/contracts";

/** Agent-scoped event kinds. */
export type AgentEventKind = Extract<LifecycleEventKind, `agent.${string}`>;

/** A lifecycle event whose kind starts with `agent.`. */
export type AgentEvent = Extract<LifecycleEvent, { kind: `agent.${string}` }>;

/** Extract a specific agent event by kind. */
export type AgentEventOf<Kind extends AgentEventKind> = LifecycleEventOf<Kind>;

export type AgentEventObserver = (event: AgentEvent) => void | Promise<void>;
