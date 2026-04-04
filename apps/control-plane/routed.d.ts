import "routedjs";
import type { Db } from "./src/db";

declare module "routedjs" {
  interface Register {
    appContext: {
      db: Db;
      userId: string;
    };
  }
}
