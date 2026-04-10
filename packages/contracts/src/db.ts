import { z } from "zod";
import type { AgentRecord } from "./agent";
import {
  WorkspaceCheckoutTypeSchema,
  WorkspaceFailureReasonSchema,
  WorkspaceStatusSchema,
  WorkspaceHostSchema,
} from "./workspace";
import type {
  WorkspaceCheckoutType,
  WorkspaceFailureReason,
  WorkspaceStatus,
  WorkspaceHost,
} from "./workspace";

export const WorkspaceRecordSchema = z
  .object({
    id: z.string(),
    repository_id: z.string(),
    name: z.string(),
    slug: z.string(),
    checkout_type: WorkspaceCheckoutTypeSchema,
    source_ref: z.string(),
    git_sha: z.string().nullable(),
    workspace_root: z.string().nullable(),
    host: WorkspaceHostSchema,
    manifest_fingerprint: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    last_active_at: z.string(),
    prepared_at: z.string().nullable().optional(),
    status: WorkspaceStatusSchema,
    failure_reason: WorkspaceFailureReasonSchema.nullable(),
    failed_at: z.string().nullable(),
  })
  .meta({ id: "WorkspaceRecord" });

export type WorkspaceRecord = z.infer<typeof WorkspaceRecordSchema>;

export type { AgentRecord };
