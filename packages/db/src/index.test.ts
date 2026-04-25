import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalDb } from "./index";
import { applyDbMigrations } from "./migrations";
import { resolveLifecycleDbPath, resolveLifecycleRootPath } from "./paths";
import {
  getRepositoryById,
  getWorkspaceRecordById,
  insertRepository,
  insertWorkspace,
} from "./queries";
import { createTursoDb } from "./turso";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

describe("@lifecycle/db", () => {
  test("resolves lifecycle root and db paths from LIFECYCLE_ROOT", () => {
    const root = "/tmp/lifecycle-dev-root";
    expect(resolveLifecycleRootPath({ LIFECYCLE_ROOT: root })).toBe(root);
    expect(resolveLifecycleDbPath({ LIFECYCLE_ROOT: root })).toBe(join(root, "lifecycle.db"));
  });

  test("wraps a local driver without changing behavior", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const db = createLocalDb({
      select: async <T>(sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return [{ ok: true }] as T[];
      },
      execute: async (sql, params) => {
        calls.push({ sql, params });
        return { rowsAffected: 3 };
      },
      transaction: async (statements) => {
        for (const statement of statements) {
          calls.push({ sql: statement.sql, params: statement.params });
        }
        return { rowsAffected: statements.map(() => 3) };
      },
    });

    expect(db.mode).toBe("local");
    expect(await db.select<{ ok: boolean }>("SELECT 1")).toEqual([{ ok: true }]);
    expect(await db.execute("UPDATE test")).toEqual({ rowsAffected: 3 });
    expect(
      await db.transaction([
        { sql: "INSERT INTO test VALUES ($1)", params: ["one"] },
        { sql: "DELETE FROM test WHERE id = $1", params: ["one"] },
      ]),
    ).toEqual({ rowsAffected: [3, 3] });
    expect(calls).toEqual([
      { sql: "SELECT 1", params: undefined },
      { sql: "UPDATE test", params: undefined },
      { sql: "INSERT INTO test VALUES ($1)", params: ["one"] },
      { sql: "DELETE FROM test WHERE id = $1", params: ["one"] },
    ]);
  });

  test("creates a local-only Turso database and normalizes placeholders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-db-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "app.db"),
      clientName: "lifecycle-test",
    });

    expect(db.mode).toBe("local");

    await db.execute("CREATE TABLE notes(id TEXT PRIMARY KEY, body TEXT)");
    await db.execute("INSERT INTO notes(id, body) VALUES ($1, $2)", ["n1", "hello"]);

    const rows = await db.select<{ id: string; body: string }>(
      "SELECT id, body FROM notes WHERE id = $1",
      ["n1"],
    );

    expect(rows).toEqual([{ id: "n1", body: "hello" }]);

    await db.transaction([
      { sql: "UPDATE notes SET body = $2 WHERE id = $1", params: ["n1", "updated"] },
      { sql: "INSERT INTO notes(id, body) VALUES ($1, $2)", params: ["n2", "world"] },
    ]);

    expect(
      await db.select<{ id: string; body: string }>("SELECT id, body FROM notes ORDER BY id"),
    ).toEqual([
      { id: "n1", body: "updated" },
      { id: "n2", body: "world" },
    ]);

    await db.close();
  });

  test("applies shared db migrations to a fresh Turso database", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-db-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "app.db"),
      clientName: "lifecycle-test",
    });

    await applyDbMigrations(db);

    const workspaceColumns = await db.select<{ name: string }>("PRAGMA table_info('workspace')");
    const repositoryColumns = await db.select<{ name: string }>("PRAGMA table_info('repository')");
    const migrationVersions = await db.select<{ version: number }>(
      "SELECT version FROM lifecycle_migration ORDER BY version ASC",
    );

    expect(workspaceColumns.some((column) => column.name === "host")).toBe(true);
    expect(workspaceColumns.some((column) => column.name === "slug")).toBe(true);
    expect(repositoryColumns.some((column) => column.name === "slug")).toBe(true);
    expect(migrationVersions.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6]);

    await db.close();
  });

  test("returns canonical workspace records directly from db queries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-db-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "app.db"),
      clientName: "lifecycle-test",
    });

    await applyDbMigrations(db);

    const repositoryId = await insertRepository(db, {
      path: "/tmp/lifecycle-repo",
      name: "lifecycle",
    });
    const workspaceId = await insertWorkspace(db, {
      repositoryId,
      name: "main",
      sourceRef: "main",
      workspaceRoot: "/tmp/lifecycle-repo",
      host: "local",
      checkoutType: "worktree",
    });

    const workspace = await getWorkspaceRecordById(db, workspaceId);

    expect(workspace).toEqual(
      expect.objectContaining({
        id: workspaceId,
        repository_id: repositoryId,
        name: "main",
        slug: "main",
        source_ref: "main",
        workspace_root: "/tmp/lifecycle-repo",
        host: "local",
        checkout_type: "worktree",
        status: "active",
      }),
    );

    await db.close();
  });

  test("derives stable unique slugs for repositories and workspaces", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-db-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "app.db"),
      clientName: "lifecycle-test",
    });

    await applyDbMigrations(db);

    const repositoryIdA = await insertRepository(db, {
      path: "/tmp/hello-a",
      name: "Hello World",
    });
    const repositoryIdB = await insertRepository(db, {
      path: "/tmp/hello-b",
      name: "Hello World",
    });
    const repositoryA = await getRepositoryById(db, repositoryIdA);
    const repositoryB = await getRepositoryById(db, repositoryIdB);

    expect(repositoryA?.slug).toBe("hello-world");
    expect(repositoryB?.slug).toBe("hello-world-2");

    const workspaceIdA = await insertWorkspace(db, {
      repositoryId: repositoryIdA,
      name: "Hello World",
      sourceRef: "main",
      workspaceRoot: "/tmp/hello-a",
      host: "local",
      checkoutType: "worktree",
    });
    const workspaceIdB = await insertWorkspace(db, {
      repositoryId: repositoryIdA,
      name: "Hello World",
      sourceRef: "feature",
      workspaceRoot: "/tmp/hello-a-2",
      host: "local",
      checkoutType: "worktree",
    });
    const workspaceIdC = await insertWorkspace(db, {
      repositoryId: repositoryIdB,
      name: "Hello World",
      sourceRef: "main",
      workspaceRoot: "/tmp/hello-b",
      host: "local",
      checkoutType: "worktree",
    });

    expect((await getWorkspaceRecordById(db, workspaceIdA))?.slug).toBe("hello-world");
    expect((await getWorkspaceRecordById(db, workspaceIdB))?.slug).toBe("hello-world-2");
    expect((await getWorkspaceRecordById(db, workspaceIdC))?.slug).toBe("hello-world");

    await db.close();
  });
});
