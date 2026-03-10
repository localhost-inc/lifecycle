import { z } from "zod";
import { parse as parseJsonc, ParseError } from "jsonc-parser";

const SetupStepSchema = z.object({
  name: z.string(),
  command: z.string(),
  timeout_seconds: z.number().int().positive(),
  cwd: z.string().optional(),
  env_vars: z.record(z.string(), z.string()).optional(),
  run_on: z.enum(["create", "start"]).optional(),
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

const ProcessServiceSchema = z.object({
  runtime: z.literal("process"),
  command: z.string(),
  cwd: z.string().optional(),
  ...BaseServiceFields,
});

const ImageServiceSchema = z.object({
  runtime: z.literal("image"),
  image: z.string(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  ...BaseServiceFields,
});

const ServiceSchema = z.discriminatedUnion("runtime", [ProcessServiceSchema, ImageServiceSchema]);

const SecretSchema = z.object({
  ref: z.string(),
  required: z.boolean(),
});

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
  secrets: z.record(z.string(), SecretSchema).optional(),
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
