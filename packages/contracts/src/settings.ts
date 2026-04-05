import { z } from "zod";

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

export const LifecycleTerminalPersistenceBackendSchema = z.enum(["tmux", "zellij"]);
export const LifecycleTerminalPersistenceModeSchema = z.enum(["managed", "inherit"]);

export const LifecycleAppearanceSettingsSchema = z.object({
  theme: LifecycleThemePreferenceSchema.default("dark"),
});

export const LifecycleTerminalCommandSettingsSchema = z.object({
  program: z.string().trim().min(1).nullable().default(null),
});

export const LifecycleTerminalPersistenceSettingsSchema = z.object({
  backend: LifecycleTerminalPersistenceBackendSchema.default("tmux"),
  mode: LifecycleTerminalPersistenceModeSchema.default("managed"),
  executablePath: z.string().trim().min(1).nullable().default(null),
});

export const LifecycleTerminalSettingsSchema = z.object({
  command: LifecycleTerminalCommandSettingsSchema.default({ program: null }),
  persistence: LifecycleTerminalPersistenceSettingsSchema.default({
    backend: "tmux",
    mode: "managed",
    executablePath: null,
  }),
});

export const LifecycleSettingsSchema = z.object({
  appearance: LifecycleAppearanceSettingsSchema.default({ theme: "dark" }),
  terminal: LifecycleTerminalSettingsSchema.default({
    command: { program: null },
    persistence: {
      backend: "tmux",
      mode: "managed",
      executablePath: null,
    },
  }),
});

export const LifecycleAppearanceSettingsUpdateSchema = LifecycleAppearanceSettingsSchema.partial();
export const LifecycleTerminalCommandSettingsUpdateSchema =
  LifecycleTerminalCommandSettingsSchema.partial();
export const LifecycleTerminalPersistenceSettingsUpdateSchema =
  LifecycleTerminalPersistenceSettingsSchema.partial();
export const LifecycleTerminalSettingsUpdateSchema =
  LifecycleTerminalSettingsSchema.partial().extend({
    command: LifecycleTerminalCommandSettingsUpdateSchema.optional(),
    persistence: LifecycleTerminalPersistenceSettingsUpdateSchema.optional(),
  });

export const LifecycleSettingsUpdateSchema = LifecycleSettingsSchema.partial().extend({
  appearance: LifecycleAppearanceSettingsUpdateSchema.optional(),
  terminal: LifecycleTerminalSettingsUpdateSchema.optional(),
});

export type LifecycleThemePreference = z.infer<typeof LifecycleThemePreferenceSchema>;
export type LifecycleTerminalPersistenceBackend = z.infer<
  typeof LifecycleTerminalPersistenceBackendSchema
>;
export type LifecycleTerminalPersistenceMode = z.infer<
  typeof LifecycleTerminalPersistenceModeSchema
>;
export type LifecycleAppearanceSettings = z.infer<typeof LifecycleAppearanceSettingsSchema>;
export type LifecycleTerminalCommandSettings = z.infer<
  typeof LifecycleTerminalCommandSettingsSchema
>;
export type LifecycleTerminalPersistenceSettings = z.infer<
  typeof LifecycleTerminalPersistenceSettingsSchema
>;
export type LifecycleTerminalSettings = z.infer<typeof LifecycleTerminalSettingsSchema>;
export type LifecycleSettings = z.infer<typeof LifecycleSettingsSchema>;
export type LifecycleSettingsUpdate = z.infer<typeof LifecycleSettingsUpdateSchema>;
