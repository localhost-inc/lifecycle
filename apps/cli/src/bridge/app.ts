import { startBridgeServer } from "./lib/server";

function resolveRequestedPort(argv: string[], env: NodeJS.ProcessEnv): number | undefined {
  const flagIndex = argv.findIndex((value) => value === "--port");
  if (flagIndex >= 0) {
    const candidate = argv[flagIndex + 1];
    const parsed = candidate ? Number.parseInt(candidate, 10) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const envPort = env.LIFECYCLE_BRIDGE_PORT;
  if (!envPort) {
    return undefined;
  }

  const parsed = Number.parseInt(envPort, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function main(argv: string[] = Bun.argv.slice(2), env: NodeJS.ProcessEnv = process.env) {
  const requestedPort = resolveRequestedPort(argv, env);
  const processHandle = await startBridgeServer(
    requestedPort === undefined ? {} : { port: requestedPort },
  );

  console.log(`Lifecycle bridge listening on http://127.0.0.1:${processHandle.port}`);
  await processHandle.wait();
}

if (import.meta.main) {
  await main();
}
