import type { Db } from "./db";
import type { WorkspaceDO } from "./workspace-do";

export interface Env {
  Bindings: {
    DB: D1Database;
    WORKSPACE_DO: DurableObjectNamespace<WorkspaceDO>;
    DAYTONA_API_KEY: string;
    DAYTONA_SNAPSHOT: string;
    WORKOS_API_KEY: string;
    WORKOS_CLIENT_ID: string;
    GITHUB_APP_ID: string;
    GITHUB_APP_PRIVATE_KEY: string;
    GITHUB_APP_SLUG: string;
  };
  Variables: {
    db: Db;
    userId: string;
  };
}
