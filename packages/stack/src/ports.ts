import { createHash } from "node:crypto";
import { createServer, type Server } from "node:net";

const PORT_RANGE_START = 41_000;
const PORT_RANGE_END = 48_999;
const PORT_RANGE_SPAN = PORT_RANGE_END - PORT_RANGE_START + 1;

export interface PortState {
  assignedPort: number | null;
  name: string;
  status: string;
}

function hashOffset(seedId: string, name: string): number {
  const hash = createHash("sha256").update(`${seedId}\0${name}`).digest();
  const n = hash.readUInt32BE(0);
  return n % PORT_RANGE_SPAN;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server: Server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function resolvePort(
  seedId: string,
  name: string,
  currentAssignedPort: number | null,
  allowBoundCurrentPort: boolean,
  reservedPorts: Set<number>,
): Promise<number> {
  const isUsable = async (candidate: number): Promise<boolean> => {
    if (reservedPorts.has(candidate)) return false;
    if (candidate === currentAssignedPort) {
      return allowBoundCurrentPort || (await isPortAvailable(candidate));
    }
    return isPortAvailable(candidate);
  };

  if (currentAssignedPort !== null && (await isUsable(currentAssignedPort))) {
    return currentAssignedPort;
  }

  const offset = hashOffset(seedId, name);
  for (let step = 0; step < PORT_RANGE_SPAN; step++) {
    const candidate = PORT_RANGE_START + ((offset + step) % PORT_RANGE_SPAN);
    if (await isUsable(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `No available port for service "${name}" in range ${PORT_RANGE_START}-${PORT_RANGE_END}.`,
  );
}

export async function assignPorts(
  seedId: string,
  names: string[],
  currentPorts: PortState[],
): Promise<Record<string, number>> {
  if (names.length === 0) return {};

  const byName = new Map(currentPorts.map((p) => [p.name, p]));
  const assigned: Record<string, number> = {};
  const reserved = new Set(
    currentPorts.filter((p) => p.assignedPort !== null).map((p) => p.assignedPort!),
  );

  for (const name of names) {
    const current = byName.get(name);
    const currentPort = current?.assignedPort ?? null;

    if (currentPort !== null) {
      reserved.delete(currentPort);
    }

    const allowBound = current?.status === "ready" || current?.status === "starting";
    const port = await resolvePort(seedId, name, currentPort, allowBound, reserved);

    assigned[name] = port;
    reserved.add(port);
  }

  return assigned;
}
