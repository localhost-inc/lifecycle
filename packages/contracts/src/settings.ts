import { z } from "zod";

const OptionalSettingStringSchema = z.string().trim().min(1).nullable().default(null);
const SettingsObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape).strict();

export const LifecycleThemePreferenceSchema = z.enum([
  "system",
  "light",
  "dark",
  "github-light",
  "github-dark",
  "nord",
  "monokai",
  "catppuccin",
  "dracula",
  "rose-pine",
]);

export const LifecycleClaudeLoginMethodSchema = z.enum(["claudeai", "console"]);
export const LifecycleTerminalPersistenceBackendSchema = z.enum(["tmux", "zellij"]);
export const LifecycleTerminalPersistenceModeSchema = z.enum(["managed", "inherit"]);
export const LifecycleTerminalLauncherSchema = z.enum([
  "shell",
  "command",
  "claude",
  "codex",
  "opencode",
]);
export const LifecycleClaudePermissionModeSchema = z.enum([
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "default",
  "dontAsk",
  "plan",
]);
export const LifecycleClaudeEffortSchema = z.enum(["low", "medium", "high", "max"]);
export const LifecycleCodexApprovalPolicySchema = z.enum(["untrusted", "on-request", "never"]);
export const LifecycleCodexSandboxModeSchema = z.enum([
  "read-only",
  "workspace-write",
  "danger-full-access",
]);
export const LifecycleCodexReasoningEffortSchema = z.enum([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);
export const LifecycleCodexWebSearchModeSchema = z.enum(["disabled", "cached", "live"]);

export const LifecycleFontFamilySchema = z.string().trim().min(1);

export const LifecycleDefaultAppearanceFontSettings = {
  ui: "Geist",
  code: "Geist Mono",
} as const;

export const LifecycleAppearanceFontSettingsSchema = SettingsObject({
  ui: LifecycleFontFamilySchema.default("Geist"),
  code: LifecycleFontFamilySchema.default("Geist Mono"),
});

export const LifecycleDefaultAppearanceSettings = {
  theme: "dark",
  fonts: LifecycleDefaultAppearanceFontSettings,
  dimInactivePanes: true,
  inactivePaneOpacity: 0.52,
} as const;

export const LifecycleDefaultTerminalCommandSettings = {
  program: null,
} as const;

export const LifecycleDefaultTerminalPersistenceSettings = {
  backend: "tmux",
  mode: "managed",
  executablePath: null,
} as const;

export const LifecycleDefaultClaudeProviderSettings = {
  loginMethod: "claudeai",
} as const;

export const LifecycleDefaultDeveloperSettings = {
  showOnboarding: false,
} as const;

export const LifecycleAppearanceSettingsSchema = SettingsObject({
  theme: LifecycleThemePreferenceSchema.default("dark"),
  fonts: LifecycleAppearanceFontSettingsSchema.default(LifecycleDefaultAppearanceFontSettings),
  dimInactivePanes: z.boolean().default(true),
  inactivePaneOpacity: z.number().min(0.2).max(1).default(0.52),
});

export const LifecycleTerminalCommandSettingsSchema = SettingsObject({
  program: OptionalSettingStringSchema,
});

export const LifecycleTerminalPersistenceSettingsSchema = SettingsObject({
  backend: LifecycleTerminalPersistenceBackendSchema.default("tmux"),
  mode: LifecycleTerminalPersistenceModeSchema.default("managed"),
  executablePath: OptionalSettingStringSchema,
});

export const LifecycleTerminalProfileCommandSchema = SettingsObject({
  program: z.string().trim().min(1),
  args: z.array(z.string().trim().min(1)).default([]),
  env: z.record(z.string(), z.string()).default({}),
});

export const LifecycleClaudeTerminalProfileSettingsSchema = SettingsObject({
  model: OptionalSettingStringSchema,
  permissionMode: LifecycleClaudePermissionModeSchema.nullable().default(null),
  effort: LifecycleClaudeEffortSchema.nullable().default(null),
});

export const LifecycleCodexTerminalProfileSettingsSchema = SettingsObject({
  model: OptionalSettingStringSchema,
  configProfile: OptionalSettingStringSchema,
  approvalPolicy: LifecycleCodexApprovalPolicySchema.nullable().default(null),
  sandboxMode: LifecycleCodexSandboxModeSchema.nullable().default(null),
  reasoningEffort: LifecycleCodexReasoningEffortSchema.nullable().default(null),
  webSearch: LifecycleCodexWebSearchModeSchema.nullable().default(null),
});

const LifecycleTerminalLaunchProfileBaseSchema = SettingsObject({
  label: OptionalSettingStringSchema,
});

export const LifecycleShellTerminalLaunchProfileSchema =
  LifecycleTerminalLaunchProfileBaseSchema.extend({
    launcher: z.literal("shell"),
  });

export const LifecycleCommandTerminalLaunchProfileSchema =
  LifecycleTerminalLaunchProfileBaseSchema.extend({
    launcher: z.literal("command"),
    command: LifecycleTerminalProfileCommandSchema,
  });

export const LifecycleClaudeTerminalLaunchProfileSchema =
  LifecycleTerminalLaunchProfileBaseSchema.extend({
    launcher: z.literal("claude"),
    settings: LifecycleClaudeTerminalProfileSettingsSchema.default({
      model: null,
      permissionMode: null,
      effort: null,
    }),
  });

export const LifecycleCodexTerminalLaunchProfileSchema =
  LifecycleTerminalLaunchProfileBaseSchema.extend({
    launcher: z.literal("codex"),
    settings: LifecycleCodexTerminalProfileSettingsSchema.default({
      model: null,
      configProfile: null,
      approvalPolicy: null,
      sandboxMode: null,
      reasoningEffort: null,
      webSearch: null,
    }),
  });

export const LifecycleOpenCodeTerminalLaunchProfileSchema =
  LifecycleTerminalLaunchProfileBaseSchema.extend({
    launcher: z.literal("opencode"),
  });

export const LifecycleTerminalLaunchProfileSchema = z.discriminatedUnion("launcher", [
  LifecycleShellTerminalLaunchProfileSchema,
  LifecycleCommandTerminalLaunchProfileSchema,
  LifecycleClaudeTerminalLaunchProfileSchema,
  LifecycleCodexTerminalLaunchProfileSchema,
  LifecycleOpenCodeTerminalLaunchProfileSchema,
]);

export const LifecycleDefaultTerminalProfileItems = {
  shell: {
    launcher: "shell",
    label: "Shell",
  },
  claude: {
    launcher: "claude",
    label: "Claude",
    settings: {
      model: null,
      permissionMode: null,
      effort: null,
    },
  },
  codex: {
    launcher: "codex",
    label: "Codex",
    settings: {
      model: null,
      configProfile: null,
      approvalPolicy: null,
      sandboxMode: null,
      reasoningEffort: null,
      webSearch: null,
    },
  },
  opencode: {
    launcher: "opencode",
    label: "OpenCode",
  },
} as const satisfies Record<string, z.input<typeof LifecycleTerminalLaunchProfileSchema>>;

export const LifecycleTerminalProfilesSchema = z
  .record(z.string(), LifecycleTerminalLaunchProfileSchema)
  .default(LifecycleDefaultTerminalProfileItems);

export const LifecycleDefaultTerminalSettings = {
  command: LifecycleDefaultTerminalCommandSettings,
  persistence: LifecycleDefaultTerminalPersistenceSettings,
  defaultProfile: "shell",
  profiles: LifecycleDefaultTerminalProfileItems,
} as const;

export const LifecycleTerminalSettingsSchema = SettingsObject({
  command: LifecycleTerminalCommandSettingsSchema.default(LifecycleDefaultTerminalCommandSettings),
  persistence: LifecycleTerminalPersistenceSettingsSchema.default(
    LifecycleDefaultTerminalPersistenceSettings,
  ),
  defaultProfile: z.string().trim().min(1).default("shell"),
  profiles: LifecycleTerminalProfilesSchema.default(LifecycleDefaultTerminalProfileItems),
});

export const LifecycleClaudeProviderSettingsSchema = SettingsObject({
  loginMethod: LifecycleClaudeLoginMethodSchema.default("claudeai"),
});

export const LifecycleDefaultProviderSettings = {
  claude: LifecycleDefaultClaudeProviderSettings,
} as const;

export const LifecycleProvidersSettingsSchema = SettingsObject({
  claude: LifecycleClaudeProviderSettingsSchema.default(LifecycleDefaultClaudeProviderSettings),
});

export const LifecycleDeveloperSettingsSchema = SettingsObject({
  showOnboarding: z.boolean().default(false),
});

export const LifecycleSettingsSchema = z
  .strictObject({
    appearance: LifecycleAppearanceSettingsSchema.default(LifecycleDefaultAppearanceSettings),
    developer: LifecycleDeveloperSettingsSchema.default(LifecycleDefaultDeveloperSettings),
    providers: LifecycleProvidersSettingsSchema.default(LifecycleDefaultProviderSettings),
    terminal: LifecycleTerminalSettingsSchema.default(LifecycleDefaultTerminalSettings),
  })
  .meta({ id: "LifecycleSettings" });

export const LifecycleAppearanceFontSettingsUpdateSchema = SettingsObject({
  ui: LifecycleFontFamilySchema.optional(),
  code: LifecycleFontFamilySchema.optional(),
});
export const LifecycleAppearanceSettingsUpdateSchema = SettingsObject({
  theme: LifecycleThemePreferenceSchema.optional(),
  fonts: LifecycleAppearanceFontSettingsUpdateSchema.optional(),
  dimInactivePanes: z.boolean().optional(),
  inactivePaneOpacity: z.number().min(0.2).max(1).optional(),
});
export const LifecycleClaudeProviderSettingsUpdateSchema =
  LifecycleClaudeProviderSettingsSchema.partial();
export const LifecycleProvidersSettingsUpdateSchema =
  LifecycleProvidersSettingsSchema.partial().extend({
    claude: LifecycleClaudeProviderSettingsUpdateSchema.optional(),
  });
export const LifecycleDeveloperSettingsUpdateSchema = LifecycleDeveloperSettingsSchema.partial();
export const LifecycleTerminalCommandSettingsUpdateSchema =
  LifecycleTerminalCommandSettingsSchema.partial();
export const LifecycleTerminalPersistenceSettingsUpdateSchema =
  LifecycleTerminalPersistenceSettingsSchema.partial();
export const LifecycleTerminalProfilesUpdateSchema = z
  .record(z.string(), LifecycleTerminalLaunchProfileSchema.nullable())
  .optional();
export const LifecycleTerminalSettingsUpdateSchema =
  LifecycleTerminalSettingsSchema.partial().extend({
    command: LifecycleTerminalCommandSettingsUpdateSchema.optional(),
    persistence: LifecycleTerminalPersistenceSettingsUpdateSchema.optional(),
    defaultProfile: z.string().trim().min(1).optional(),
    profiles: LifecycleTerminalProfilesUpdateSchema,
  });

export const LifecycleSettingsUpdateSchema = LifecycleSettingsSchema.partial()
  .extend({
    appearance: LifecycleAppearanceSettingsUpdateSchema.optional(),
    developer: LifecycleDeveloperSettingsUpdateSchema.optional(),
    providers: LifecycleProvidersSettingsUpdateSchema.optional(),
    terminal: LifecycleTerminalSettingsUpdateSchema.optional(),
  })
  .meta({ id: "LifecycleSettingsUpdate" });

export type LifecycleThemePreference = z.infer<typeof LifecycleThemePreferenceSchema>;
export type LifecycleClaudeLoginMethod = z.infer<typeof LifecycleClaudeLoginMethodSchema>;
export type LifecycleTerminalPersistenceBackend = z.infer<
  typeof LifecycleTerminalPersistenceBackendSchema
>;
export type LifecycleTerminalPersistenceMode = z.infer<
  typeof LifecycleTerminalPersistenceModeSchema
>;
export type LifecycleTerminalLauncher = z.infer<typeof LifecycleTerminalLauncherSchema>;
export type LifecycleClaudePermissionMode = z.infer<typeof LifecycleClaudePermissionModeSchema>;
export type LifecycleClaudeEffort = z.infer<typeof LifecycleClaudeEffortSchema>;
export type LifecycleCodexApprovalPolicy = z.infer<typeof LifecycleCodexApprovalPolicySchema>;
export type LifecycleCodexSandboxMode = z.infer<typeof LifecycleCodexSandboxModeSchema>;
export type LifecycleCodexReasoningEffort = z.infer<typeof LifecycleCodexReasoningEffortSchema>;
export type LifecycleCodexWebSearchMode = z.infer<typeof LifecycleCodexWebSearchModeSchema>;
export type LifecycleAppearanceFontSettings = z.infer<typeof LifecycleAppearanceFontSettingsSchema>;
export type LifecycleAppearanceSettings = z.infer<typeof LifecycleAppearanceSettingsSchema>;
export type LifecycleClaudeProviderSettings = z.infer<typeof LifecycleClaudeProviderSettingsSchema>;
export type LifecycleProvidersSettings = z.infer<typeof LifecycleProvidersSettingsSchema>;
export type LifecycleDeveloperSettings = z.infer<typeof LifecycleDeveloperSettingsSchema>;
export type LifecycleTerminalCommandSettings = z.infer<
  typeof LifecycleTerminalCommandSettingsSchema
>;
export type LifecycleTerminalPersistenceSettings = z.infer<
  typeof LifecycleTerminalPersistenceSettingsSchema
>;
export type LifecycleTerminalProfileCommand = z.infer<typeof LifecycleTerminalProfileCommandSchema>;
export type LifecycleClaudeTerminalProfileSettings = z.infer<
  typeof LifecycleClaudeTerminalProfileSettingsSchema
>;
export type LifecycleCodexTerminalProfileSettings = z.infer<
  typeof LifecycleCodexTerminalProfileSettingsSchema
>;
export type LifecycleTerminalLaunchProfile = z.infer<typeof LifecycleTerminalLaunchProfileSchema>;
export type LifecycleTerminalProfiles = z.infer<typeof LifecycleTerminalProfilesSchema>;
export type LifecycleTerminalSettings = z.infer<typeof LifecycleTerminalSettingsSchema>;
export type LifecycleSettings = z.infer<typeof LifecycleSettingsSchema>;
export type LifecycleSettingsUpdate = z.infer<typeof LifecycleSettingsUpdateSchema>;
