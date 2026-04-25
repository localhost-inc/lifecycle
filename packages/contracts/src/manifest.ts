import { parse as parseJsonc, ParseError } from "jsonc-parser";
import { z } from "zod";

const UNSUPPORTED_SECRETS_MESSAGE =
  "Managed secrets are not supported in local lifecycle.json yet. Materialize local env files in workspace prepare instead.";

const UNSUPPORTED_SECRET_TEMPLATE_MESSAGE =
  "`${secrets.*}` is not supported in local lifecycle.json. Materialize local env files in workspace prepare instead.";

const UNSUPPORTED_RESET_MESSAGE =
  "`reset` is not part of the current lifecycle.json contract yet. Remove it from the manifest for now.";

const UNSUPPORTED_MCPS_MESSAGE =
  "`mcps` is not part of the current lifecycle.json contract yet. Remove it from the manifest for now.";

const RunOnSchema = z.enum(["create", "start"]);

function validateStepAction(
  step: {
    command?: string | undefined;
    write_files?:
      | {
          path: string;
          content?: string | undefined;
          lines?: string[] | undefined;
        }[]
      | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const hasCommand = typeof step.command === "string";
  const hasWriteFiles = Array.isArray(step.write_files);
  if (hasCommand === hasWriteFiles) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Workspace steps require exactly one of command or write_files",
      path: hasCommand ? ["write_files"] : ["command"],
    });
  }
}

const SetupWriteFileSchema = z
  .object({
    path: z.string(),
    content: z.string().optional(),
    lines: z.array(z.string()).min(1).optional(),
  })
  .superRefine((file, ctx) => {
    const hasContent = typeof file.content === "string";
    const hasLines = Array.isArray(file.lines);
    if (hasContent === hasLines) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Workspace write_files entries require exactly one of content or lines",
        path: hasContent ? ["lines"] : ["content"],
      });
    }
  });

const StepActionFields = {
  command: z.string().optional(),
  write_files: z.array(SetupWriteFileSchema).min(1).optional(),
  timeout_seconds: z.number().int().positive(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
};

const WorkspaceStepSchema = z
  .object({
    name: z.string(),
    ...StepActionFields,
    depends_on: z.array(z.string()).optional(),
    run_on: RunOnSchema.optional(),
  })
  .superRefine(validateStepAction);

const WorkspaceSchema = z
  .object({
    prepare: z.array(WorkspaceStepSchema).default([]),
    teardown: z.array(WorkspaceStepSchema).optional(),
  })
  .superRefine((workspace, ctx) => {
    workspace.prepare.forEach((step, index) => {
      if (step.depends_on) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "workspace.prepare steps cannot declare depends_on",
          path: ["prepare", index, "depends_on"],
        });
      }
    });

    workspace.teardown?.forEach((step, index) => {
      if (step.depends_on) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "workspace.teardown steps cannot declare depends_on",
          path: ["teardown", index, "depends_on"],
        });
      }
      if (step.run_on) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "workspace.teardown steps cannot declare run_on",
          path: ["teardown", index, "run_on"],
        });
      }
    });
  });

const HealthCheckSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tcp"),
    host: z.string(),
    port: z.union([z.number().int().positive(), z.string().min(1)]),
    timeout_seconds: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("http"),
    url: z.string(),
    timeout_seconds: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("container"),
    timeout_seconds: z.number().int().positive(),
  }),
]);

const BaseManagedNodeFields = {
  env: z.record(z.string(), z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
  startup_timeout_seconds: z.number().int().positive().optional(),
  health_check: HealthCheckSchema.optional(),
};

const ImageBuildSchema = z.object({
  context: z.string(),
  dockerfile: z.string().optional(),
});

const NamedVolumeSourceSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_.-]*$/,
    "Named volumes must start with an alphanumeric character and contain only letters, numbers, dots, underscores, or dashes",
  );

const ImageVolumeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bind"),
    source: z.string().min(1),
    target: z.string().min(1),
    read_only: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("volume"),
    source: NamedVolumeSourceSchema,
    target: z.string().min(1),
    read_only: z.boolean().optional(),
  }),
]);

const TaskNodeSchema = z
  .object({
    kind: z.literal("task"),
    ...StepActionFields,
    depends_on: z.array(z.string()).optional(),
    run_on: RunOnSchema.optional(),
  })
  .superRefine(validateStepAction);

const ProcessNodeSchema = z
  .object({
    kind: z.literal("process"),
    command: z.string(),
    cwd: z.string().optional(),
    ...BaseManagedNodeFields,
  })
  .superRefine((node, ctx) => {
    if (node.health_check?.kind === "container") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Container health checks are only valid for kind: "image" nodes',
        path: ["health_check", "kind"],
      });
    }
  });

const ImageNodeSchema = z
  .object({
    kind: z.literal("image"),
    image: z.string().optional(),
    build: ImageBuildSchema.optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    volumes: z.array(ImageVolumeSchema).optional(),
    port: z.number().int().positive().optional(),
    ...BaseManagedNodeFields,
  })
  .superRefine((node, ctx) => {
    if (!node.image && !node.build) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Image nodes require either image or build",
        path: ["image"],
      });
    }
  });

const StackNodeSchema = z.union([TaskNodeSchema, ProcessNodeSchema, ImageNodeSchema]);

export const LifecycleConfigSchema = z.object({
  workspace: WorkspaceSchema,
  stack: z
    .object({
      nodes: z.record(z.string(), StackNodeSchema),
    })
    .optional(),
});

export type LifecycleConfig = z.infer<typeof LifecycleConfigSchema>;

export interface FieldError {
  path: string;
  message: string;
}

export type ManifestParseResult =
  | { valid: true; config: LifecycleConfig }
  | { valid: false; errors: FieldError[] };

function collectUnsupportedManifestErrors(
  value: unknown,
  path: Array<string | number> = [],
): FieldError[] {
  const errors: FieldError[] = [];

  if (typeof value === "string") {
    if (value.includes("${secrets.")) {
      errors.push({
        path: path.join("."),
        message: UNSUPPORTED_SECRET_TEMPLATE_MESSAGE,
      });
    }
    return errors;
  }

  if (!value || typeof value !== "object") {
    return errors;
  }

  if (!Array.isArray(value) && path.length === 0) {
    if (Object.hasOwn(value, "secrets")) {
      errors.push({
        path: "secrets",
        message: UNSUPPORTED_SECRETS_MESSAGE,
      });
    }
    if (Object.hasOwn(value, "reset")) {
      errors.push({
        path: "reset",
        message: UNSUPPORTED_RESET_MESSAGE,
      });
    }
    if (Object.hasOwn(value, "mcps")) {
      errors.push({
        path: "mcps",
        message: UNSUPPORTED_MCPS_MESSAGE,
      });
    }
  }

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      errors.push(...collectUnsupportedManifestErrors(entry, [...path, index]));
    }
    return errors;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (path.length === 0 && (key === "secrets" || key === "reset" || key === "mcps")) {
      continue;
    }
    errors.push(...collectUnsupportedManifestErrors(entry, [...path, key]));
  }

  return errors;
}

export function parseManifest(text: string): ManifestParseResult {
  const parseErrors: ParseError[] = [];
  const parsed = parseJsonc(text, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (parseErrors.length > 0) {
    return {
      valid: false,
      errors: parseErrors.map((e) => ({
        path: "",
        message: `JSONC parse error at offset ${e.offset}: ${e.error}`,
      })),
    };
  }

  if (parsed === undefined || parsed === null) {
    return {
      valid: false,
      errors: [{ path: "", message: "Empty or null configuration" }],
    };
  }

  const unsupportedManifestErrors = collectUnsupportedManifestErrors(parsed);
  if (unsupportedManifestErrors.length > 0) {
    return {
      valid: false,
      errors: unsupportedManifestErrors,
    };
  }

  const result = LifecycleConfigSchema.safeParse(parsed);

  if (result.success) {
    return { valid: true, config: result.data };
  }

  const errors: FieldError[] = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  return { valid: false, errors };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
    .join(",")}}`;
}

export function getManifestFingerprint(config: LifecycleConfig): string {
  return stableSerialize(config);
}
