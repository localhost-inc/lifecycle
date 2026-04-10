import { createRoute } from "routedjs";
import { z } from "zod";
import { connectWorkspaceTerminal } from "../../../../../src/domains/terminal/service";

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
const BridgeWorkspaceTerminalRuntimeSchema = z
  .object({
    backend_label: z.string(),
    runtime_id: z.string().nullable(),
    launch_error: z.string().nullable(),
    persistent: z.boolean(),
    supports_create: z.boolean(),
    supports_close: z.boolean(),
    supports_connect: z.boolean(),
    supports_rename: z.boolean(),
  })
  .meta({ id: "BridgeWorkspaceTerminalRuntime" });
const BridgeShellLaunchSpecSchema = z
  .object({
    program: z.string(),
    args: z.array(z.string()),
    cwd: z.string().nullable(),
    env: z.array(z.tuple([z.string(), z.string()])),
  })
  .meta({ id: "BridgeShellLaunchSpec" });
const BridgeTerminalTransportSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("spawn"),
        prepare: BridgeShellLaunchSpecSchema.nullable().optional(),
        spec: BridgeShellLaunchSpecSchema.nullable().optional(),
      })
      .meta({ id: "BridgeSpawnTerminalTransport" }),
    z
      .object({
        kind: z.literal("stream"),
        streamId: z.string(),
        websocketPath: z.string(),
        token: z.string(),
        protocol: z.string(),
      })
      .meta({ id: "BridgeStreamTerminalTransport" }),
  ])
  .meta({ id: "BridgeTerminalTransport" });
const BridgeWorkspaceTerminalConnectionEnvelopeSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    runtime: BridgeWorkspaceTerminalRuntimeSchema,
    connection: z
      .object({
        connection_id: z.string(),
        terminal_id: z.string(),
        launch_error: z.string().nullable(),
        transport: BridgeTerminalTransportSchema.nullable().optional(),
      })
      .meta({ id: "BridgeWorkspaceTerminalConnection" }),
  })
  .meta({ id: "BridgeWorkspaceTerminalConnectionEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
      terminalId: z.string().min(1),
    }),
    body: z.object({
      clientId: z.string().min(1),
      access: z.enum(["interactive", "observe"]).default("interactive"),
      preferredTransport: z.enum(["spawn", "stream"]).default("spawn"),
    }),
    responses: {
      200: BridgeWorkspaceTerminalConnectionEnvelopeSchema,
    },
  },
  handler: async ({ body, params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await connectWorkspaceTerminal(db, workspaceRegistry, params.id, {
      access: body.access,
      clientId: body.clientId,
      preferredTransport: body.preferredTransport,
      terminalId: params.terminalId,
    });
  },
});
