# Database Migrations

This repo treats the desktop SQLite schema as a versioned contract.

## Rules

1. Every desktop schema change must land as a numbered SQL migration in `apps/desktop/src-tauri/src/platform/migrations`.
2. The applied-version ledger is `schema_migration`. It is the only migration source of truth.
3. Do not add startup-time `ALTER TABLE` helpers, `ensure_*_columns` guards, or other ad hoc schema mutation paths.
4. Before launch, prefer squashing the migration baseline to the current schema instead of preserving unshipped upgrade history.
5. After launch, keep migrations additive and forward-only. If a schema correction is needed, add a new migration instead of editing an already-shipped one.
6. Update `apps/desktop/src-tauri/src/platform/db.rs` tests when migration behavior changes, with priority on fresh-database bootstrap and only on upgrade paths that correspond to shipped schemas.

## Runtime Contract

`run_migrations` in `apps/desktop/src-tauri/src/platform/db.rs` is responsible for:

1. Creating `schema_migration` if it does not exist.
2. Applying numbered migrations in order.

The runner does not try to adopt pre-migration or ad hoc schemas. During development, if a local database predates the current numbered migration chain or an unsquashed pre-launch baseline, delete it and let the app recreate it from migrations.

## Change Checklist

When you change the desktop schema:

1. Add the next numbered SQL file under `apps/desktop/src-tauri/src/platform/migrations`.
2. Register it in `MIGRATIONS` in `apps/desktop/src-tauri/src/platform/db.rs`.
3. Add or update migration tests in `apps/desktop/src-tauri/src/platform/db.rs`.
4. Run `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`.
5. Update docs if the persisted contract changed.
