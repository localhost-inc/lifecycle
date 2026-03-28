import type { LifecycleConfig, ServiceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import type { SqlCollection } from "../collection";
import { selectServicesByWorkspace } from "../collections/services";

function createEphemeralId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function declaredServiceNames(config: LifecycleConfig | null): string[] {
  if (!config) {
    return [];
  }

  return Object.entries(config.environment)
    .filter(([, node]) => node.kind === "service")
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
}

export async function reconcileWorkspaceServices(input: {
  config: LifecycleConfig | null;
  driver: SqlDriver;
  occurredAt: string;
  services: SqlCollection<ServiceRecord>;
  workspaceId: string;
}): Promise<void> {
  const existing = await selectServicesByWorkspace(input.driver, input.workspaceId);
  const existingByName = new Map(existing.map((service) => [service.name, service]));
  const declaredNames = declaredServiceNames(input.config);
  const declaredNameSet = new Set(declaredNames);

  for (const service of existing) {
    if (declaredNameSet.has(service.name)) {
      continue;
    }

    const transaction = input.services.delete(service.id);
    await transaction.isPersisted.promise;
  }

  for (const serviceName of declaredNames) {
    const current = existingByName.get(serviceName);
    if (current) {
      const transaction = input.services.update(current.id, (draft) => {
        draft.status = "stopped";
        draft.status_reason = null;
        draft.assigned_port = null;
        draft.preview_url = null;
        draft.updated_at = input.occurredAt;
      });
      await transaction.isPersisted.promise;
      continue;
    }

    const transaction = input.services.insert({
      id: createEphemeralId(),
      workspace_id: input.workspaceId,
      name: serviceName,
      status: "stopped",
      status_reason: null,
      assigned_port: null,
      preview_url: null,
      created_at: input.occurredAt,
      updated_at: input.occurredAt,
    });
    await transaction.isPersisted.promise;
  }
}
