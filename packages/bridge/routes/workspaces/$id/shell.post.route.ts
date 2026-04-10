import { createRoute } from "routedjs";
import { z } from "zod";
import { readWorkspaceShell } from "../../../src/domains/terminal/service";

const BridgeWorkspaceScopeSchema = z
  .object({
    binding: z.enum(["bound", "adhoc"]).meta({ id: "BridgeWorkspaceBinding" }),
    workspace_id: z.string().nullable(),
    workspace_name: z.string(),
    repo_name: z.string().nullable(),
    host: z
      .enum(["local", "docker", "remote", "cloud", "unknown"])
      .meta({ id: "BridgeWorkspaceScopeHost" }),
    status: z.string().nullable(),
    source_ref: z.string().nullable(),
    cwd: z.string().nullable(),
    workspace_root: z.string().nullable(),
    resolution_note: z.string().nullable(),
    resolution_error: z.string().nullable(),
  })
  .meta({ id: "BridgeWorkspaceScope" });

const BridgeShellLaunchSpecSchema = z
  .object({
    program: z.string(),
    args: z.array(z.string()),
    cwd: z.string().nullable(),
    env: z.array(z.tuple([z.string(), z.string()])),
  })
  .meta({ id: "BridgeShellLaunchSpec" });

const BridgeWorkspaceShellRuntimeSchema = z
  .object({
    backend_label: z.string(),
    launch_error: z.string().nullable(),
    persistent: z.boolean(),
    session_name: z.string().nullable(),
    prepare: BridgeShellLaunchSpecSchema.nullable(),
    spec: BridgeShellLaunchSpecSchema.nullable(),
  })
  .meta({ id: "BridgeWorkspaceShellRuntime" });

const BridgeWorkspaceShellEnvelopeSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    shell: BridgeWorkspaceShellRuntimeSchema,
  })
  .meta({ id: "BridgeWorkspaceShellEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
    responses: {
      200: BridgeWorkspaceShellEnvelopeSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await readWorkspaceShell(db, workspaceRegistry, params.id);
  },
});
