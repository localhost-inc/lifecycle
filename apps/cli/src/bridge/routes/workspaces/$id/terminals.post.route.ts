import { createRoute } from "routedjs";
import { z } from "zod";
import { createWorkspaceTerminal } from "../../../domains/terminal/service";

const BridgeTerminalKindSchema = z
  .enum(["shell", "claude", "codex", "custom"])
  .meta({ id: "BridgeTerminalKind" });
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
const BridgeWorkspaceTerminalRecordSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    kind: z.string(),
    busy: z.boolean(),
  })
  .meta({ id: "BridgeWorkspaceTerminalRecord" });
const BridgeWorkspaceCreatedTerminalEnvelopeSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    runtime: BridgeWorkspaceTerminalRuntimeSchema,
    terminal: BridgeWorkspaceTerminalRecordSchema,
  })
  .meta({ id: "BridgeWorkspaceCreatedTerminalEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      kind: BridgeTerminalKindSchema.optional(),
      title: z.string().trim().min(1).nullable().optional(),
    }),
    responses: {
      201: BridgeWorkspaceCreatedTerminalEnvelopeSchema,
    },
  },
  handler: async ({ body, params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    const [{ broadcastMessage }, { buildWorkspaceSnapshotInvalidatedMessage, workspaceTopic }] =
      await Promise.all([
        import("../../../lib/server"),
        import("../../../lib/socket-topics"),
      ]);
    const response = await createWorkspaceTerminal(db, workspaceRegistry, params.id, {
      ...(body.kind ? { kind: body.kind } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
    });
    broadcastMessage(
      buildWorkspaceSnapshotInvalidatedMessage({
        reason: "terminal.created",
        workspaceId: params.id,
      }),
      workspaceTopic(params.id),
    );
    ctx.status(201);
    return response;
  },
});
