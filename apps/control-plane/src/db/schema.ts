import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
};

// ── Users ──

export const user = sqliteTable("user", {
  id: text("id").primaryKey().notNull(),
  workosUserId: text("workos_user_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

// ── User environments ──
// Stores the user's synced local environment profile for cloud workspaces.

export const userEnvironment = sqliteTable("user_environment", {
  userId: text("user_id")
    .primaryKey()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  gitName: text("git_name"),
  gitEmail: text("git_email"),
  gitConfigBase64: text("git_config_base64"),
  claudeAccessToken: text("claude_access_token"),
  claudeRefreshToken: text("claude_refresh_token"),
  claudeSettingsBase64: text("claude_settings_base64"),
  codexAuthBase64: text("codex_auth_base64"),
  ...timestamps,
});

// ── Organizations ──

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey().notNull(),
  workosOrganizationId: text("workos_organization_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

// ── Organization memberships ──

export const organizationMembership = sqliteTable("organization_membership", {
  id: text("id").primaryKey().notNull(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  workosMembershipId: text("workos_membership_id").notNull().unique(),
  role: text("role").notNull().default("member"),
  ...timestamps,
});

// ── Repositories ──
// The root cloud entity. Owns the org binding, GitHub identity, and project path.

export const repository = sqliteTable("repository", {
  id: text("id").primaryKey().notNull(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("github"),
  providerRepoId: text("provider_repo_id").notNull(),
  installationId: text("installation_id").notNull(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  path: text("path").notNull(),
  status: text("status").notNull().default("connected"),
  ...timestamps,
});

// ── Organization cloud accounts ──

export const organizationCloudAccount = sqliteTable("organization_cloud_account", {
  id: text("id").primaryKey().notNull(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("cloudflare"),
  accountId: text("account_id").notNull(),
  tokenKind: text("token_kind").notNull().default("account"),
  tokenSecretRef: text("token_secret_ref").notNull(),
  status: text("status").notNull().default("connected"),
  lastVerifiedAt: text("last_verified_at"),
  lastErrorCode: text("last_error_code"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  ...timestamps,
});

// ── Workspaces ──

export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey().notNull(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repository.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  host: text("host").notNull().default("cloud"),
  sourceRef: text("source_ref").notNull(),
  status: text("status").notNull().default("provisioning"),
  environmentStatus: text("environment_status").notNull().default("idle"),
  sandboxId: text("sandbox_id"),
  workspaceRoot: text("workspace_root"),
  preparedAt: text("prepared_at"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  failureReason: text("failure_reason"),
  ...timestamps,
});
