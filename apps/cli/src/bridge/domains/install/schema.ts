import { z } from "zod";

const InstallStepIdSchema = z
  .enum(["proxy", "claude-code", "codex", "agents-md", "claude-md"])
  .meta({ id: "InstallStepId" });
const InstallDocumentScopeSchema = z
  .enum(["project", "user"])
  .meta({ id: "InstallDocumentScope" });
const InstallStepScopeSchema = z
  .enum(["machine", "repository", "user"])
  .meta({ id: "InstallStepScope" });
const InstallInspectStatusSchema = z
  .enum(["installed", "missing", "outdated", "unsupported"])
  .meta({ id: "InstallInspectStatus" });
const InstallApplyStatusSchema = z
  .enum(["applied", "unchanged", "requires_elevation", "unsupported"])
  .meta({ id: "InstallApplyStatus" });

const InstallInspectTargetSchema = z
  .object({
    harness_id: z.string(),
    integration: z.string(),
    label: z.string(),
    path: z.string().nullable(),
    status: z.string(),
  })
  .meta({ id: "InstallInspectTarget" });

const InstallInspectStepSchema = z
  .object({
    detail: z.string().nullable(),
    id: InstallStepIdSchema,
    label: z.string(),
    path: z.string().nullable(),
    requires_elevation: z.boolean(),
    scope: InstallStepScopeSchema,
    selected_by_default: z.boolean(),
    status: InstallInspectStatusSchema,
    targets: z.array(InstallInspectTargetSchema),
  })
  .meta({ id: "InstallInspectStep" });

const InstallInspectionSchema = z
  .object({
    document_scope: InstallDocumentScopeSchema,
    ready: z.boolean(),
    repo_path: z.string().nullable(),
    steps: z.array(InstallInspectStepSchema),
  })
  .meta({ id: "InstallInspection" });

const InstallApplyTargetSchema = z
  .object({
    harness_id: z.string(),
    integration: z.string(),
    label: z.string(),
    path: z.string().nullable(),
    status: z.string(),
  })
  .meta({ id: "InstallApplyTarget" });

const InstallApplyStepSchema = z
  .object({
    actions: z.array(z.string()),
    detail: z.string().nullable(),
    id: InstallStepIdSchema,
    label: z.string(),
    path: z.string().nullable(),
    scope: InstallStepScopeSchema,
    status: InstallApplyStatusSchema,
    targets: z.array(InstallApplyTargetSchema),
  })
  .meta({ id: "InstallApplyStep" });

const InstallApplyResponseSchema = z
  .object({
    document_scope: InstallDocumentScopeSchema,
    ready: z.boolean(),
    repo_path: z.string().nullable(),
    steps: z.array(InstallApplyStepSchema),
  })
  .meta({ id: "InstallApplyResponse" });

export {
  InstallStepIdSchema,
  InstallDocumentScopeSchema,
  InstallStepScopeSchema,
  InstallInspectStatusSchema,
  InstallApplyStatusSchema,
  InstallInspectTargetSchema,
  InstallInspectStepSchema,
  InstallInspectionSchema,
  InstallApplyTargetSchema,
  InstallApplyStepSchema,
  InstallApplyResponseSchema,
};
