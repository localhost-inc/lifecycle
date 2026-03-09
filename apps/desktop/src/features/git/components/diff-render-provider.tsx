import { useWorkerPool, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { useEffect, useMemo, type ReactNode } from "react";

const DEFAULT_DIFF_RENDER_CACHE_SIZE = 300;
const MAX_DIFF_RENDER_WORKERS = 4;
const MIN_DIFF_RENDER_WORKERS = 2;

interface DiffRenderProviderProps {
  children: ReactNode;
  theme: string;
}

const createDiffRenderWorker = () =>
  new Worker(new URL("../workers/diff-render-worker.ts", import.meta.url), { type: "module" });

function DiffThemeSyncer({ theme }: { theme: string }) {
  const workerPool = useWorkerPool();

  useEffect(() => {
    void workerPool?.setRenderOptions({ theme: { dark: theme, light: theme } });
  }, [theme, workerPool]);

  return null;
}

export function DiffRenderProvider({ children, theme }: DiffRenderProviderProps) {
  const poolSize = useMemo(() => {
    if (typeof navigator === "undefined" || !Number.isFinite(navigator.hardwareConcurrency)) {
      return MIN_DIFF_RENDER_WORKERS;
    }

    return Math.max(
      MIN_DIFF_RENDER_WORKERS,
      Math.min(MAX_DIFF_RENDER_WORKERS, Math.floor(navigator.hardwareConcurrency / 2)),
    );
  }, []);

  return (
    <WorkerPoolContextProvider
      highlighterOptions={{ theme: { dark: theme, light: theme } }}
      poolOptions={{
        poolSize,
        totalASTLRUCacheSize: DEFAULT_DIFF_RENDER_CACHE_SIZE,
        workerFactory: createDiffRenderWorker,
      }}
    >
      <DiffThemeSyncer theme={theme} />
      {children}
    </WorkerPoolContextProvider>
  );
}
