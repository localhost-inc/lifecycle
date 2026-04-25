import { createRoute } from "routedjs";
import { z } from "zod";

const BridgeHealthResponseSchema = z
  .object({
    ok: z.boolean(),
    healthy: z.boolean(),
    pid: z.number().int(),
    repoRoot: z.string().nullable(),
    dev: z.boolean(),
    supervisorPid: z.number().int().nullable(),
    gitSha: z.string().nullable(),
  })
  .meta({ id: "BridgeHealthResponse" });

function parseOptionalPid(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default createRoute({
  schemas: {
    responses: {
      200: BridgeHealthResponseSchema,
    },
  },
  handler: async () => ({
    ok: true,
    healthy: true,
    pid: process.pid,
    repoRoot: process.env.LIFECYCLE_REPO_ROOT ?? null,
    dev: process.env.LIFECYCLE_DEV === "1" || process.env.LIFECYCLE_DEV_SUPERVISOR === "monorepo",
    supervisorPid: parseOptionalPid(process.env.LIFECYCLE_DEV_SUPERVISOR_PID),
    gitSha: process.env.LIFECYCLE_GIT_SHA ?? null,
  }),
});
