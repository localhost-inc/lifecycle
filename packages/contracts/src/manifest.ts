import { z } from "zod";
import { parse as parseJsonc, ParseError } from "jsonc-parser";

const UNSUPPORTED_SECRETS_MESSAGE =
  "Managed secrets are not supported in local lifecycle.json yet. Materialize local env files in setup instead.";

const UNSUPPORTED_SECRET_TEMPLATE_MESSAGE =
  "`${secrets.*}` is not supported in local lifecycle.json. Materialize local env files in setup instead.";

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
        message: "Setup write_files entries require exactly one of content or lines",
        path: hasContent ? ["lines"] : ["content"],
      });
    }
  });

const SetupStepSchema = z
  .object({
    name: z.string(),
    command: z.string().optional(),
    write_files: z.array(SetupWriteFileSchema).min(1).optional(),
    timeout_seconds: z.number().int().positive(),
    cwd: z.string().optional(),
    env_vars: z.record(z.string(), z.string()).optional(),
    run_on: z.enum(["create", "start"]).optional(),
  })
  .superRefine((step, ctx) => {
    const hasCommand = typeof step.command === "string";
    const hasWriteFiles = Array.isArray(step.write_files);
    if (hasCommand === hasWriteFiles) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Setup steps require exactly one of command or write_files",
        path: hasCommand ? ["write_files"] : ["command"],
      });
    }
  });

const SetupSchema = z.object({
  services: z.array(z.string()).optional(),
  steps: z.array(SetupStepSchema).min(1),
});

const HealthCheckSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tcp"),
    host: z.string(),
    port: z.number().int().positive(),
    timeout_seconds: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("http"),
    url: z.string(),
    timeout_seconds: z.number().int().positive(),
  }),
]);

const BaseServiceFields = {
  env_vars: z.record(z.string(), z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
  restart_policy: z.string().optional(),
  startup_timeout_seconds: z.number().int().positive().optional(),
  health_check: HealthCheckSchema.optional(),
  port: z.number().int().positive().optional(),
  share_default: z.boolean().optional(),
};

const ImageBuildSchema = z.object({
  context: z.string(),
  dockerfile: z.string().optional(),
});

const ImageVolumeSchema = z.object({
  source: z.string(),
  target: z.string(),
  read_only: z.boolean().optional(),
});

const ProcessServiceSchema = z.object({
  runtime: z.literal("process"),
  command: z.string(),
  cwd: z.string().optional(),
  ...BaseServiceFields,
});

const ImageServiceSchema = z
  .object({
    runtime: z.literal("image"),
    image: z.string().optional(),
    build: ImageBuildSchema.optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    volumes: z.array(ImageVolumeSchema).optional(),
    ...BaseServiceFields,
  })
  .superRefine((service, ctx) => {
    if (!service.image && !service.build) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Image services require either image or build",
        path: ["image"],
      });
    }
  });

const ServiceSchema = z.discriminatedUnion("runtime", [ProcessServiceSchema, ImageServiceSchema]);

const McpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  transport: z.enum(["stdio", "sse"]),
  env_vars: z.record(z.string(), z.string()).optional(),
});

const ResetSchema = z.object({
  strategy: z.enum(["reseed", "snapshot"]).optional(),
  command: z.string().optional(),
  timeout_seconds: z.number().int().positive().optional(),
});

export const LifecycleConfigSchema = z.object({
  setup: SetupSchema,
  services: z.record(z.string(), ServiceSchema),
  reset: ResetSchema.optional(),
  mcps: z.record(z.string(), McpServerSchema).optional(),
});

export type LifecycleConfig = z.infer<typeof LifecycleConfigSchema>;

export interface FieldError {
  path: string;
  message: string;
}

export type ManifestParseResult =
  | { valid: true; config: LifecycleConfig }
  | { valid: false; errors: FieldError[] };

function collectUnsupportedSecretErrors(
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

  if (!Array.isArray(value) && path.length === 0 && Object.hasOwn(value, "secrets")) {
    errors.push({
      path: "secrets",
      message: UNSUPPORTED_SECRETS_MESSAGE,
    });
  }

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      errors.push(...collectUnsupportedSecretErrors(entry, [...path, index]));
    }
    return errors;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (path.length === 0 && key === "secrets") {
      continue;
    }
    errors.push(...collectUnsupportedSecretErrors(entry, [...path, key]));
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

  const unsupportedSecretErrors = collectUnsupportedSecretErrors(parsed);
  if (unsupportedSecretErrors.length > 0) {
    return {
      valid: false,
      errors: unsupportedSecretErrors,
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
