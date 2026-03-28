/**
 * Shared test helper that mocks the store context for components that call
 * workspace host client hooks, useWorkspaceServices(), or other store hooks.
 *
 * Call `mockStoreContext()` before importing the component under test.
 * It returns a cleanup function, but `mock.restore()` in afterEach works too.
 */
import { spyOn } from "bun:test";

const noopClient = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === "readManifest") {
        return () => Promise.resolve({ state: "missing" });
      }
      if (prop === "getGitCurrentBranch") {
        return () => Promise.resolve("main");
      }
      return () => Promise.resolve(undefined);
    },
  },
);
const noopAgentClient = new Proxy(
  {},
  { get: (_target, _prop) => () => Promise.resolve(undefined) },
);

export function mockStoreContext() {
  // We need to use require-style dynamic import so the spy is set
  // synchronously before the component under test resolves its imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storeProvider = require("@/store/provider");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const workspaceClientProvider = require("@lifecycle/workspace/react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const agentProvider = require("@lifecycle/agents/react");

  spyOn(workspaceClientProvider, "useWorkspaceClient").mockReturnValue(noopClient);
  spyOn(agentProvider, "useAgentClient").mockReturnValue(noopAgentClient);

  return spyOn(storeProvider, "useStoreContext").mockReturnValue({
    collections: {
      projects: {
        collection: {
          toArray: [],
          get: () => undefined,
          subscribeChanges: () => ({ unsubscribe: () => {} }),
        },
      },
      workspaces: {
        collection: {
          toArray: [],
          get: () => undefined,
          subscribeChanges: () => ({ unsubscribe: () => {} }),
        },
      },
      services: {
        collection: {
          toArray: [],
          get: () => undefined,
          subscribeChanges: () => ({ unsubscribe: () => {} }),
        },
      },
    },
    driver: {},
  } as never);
}
