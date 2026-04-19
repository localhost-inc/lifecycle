import { watch as watchFs } from "node:fs";

export interface WatchPathOptions {
  recursive: boolean;
  delayMs: number;
}

export type WatchPath = (
  path: string,
  callback: () => void,
  options: WatchPathOptions,
) => Promise<() => void>;

export const watchPath: WatchPath = async (path, callback, options) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const watcher = watchFs(path, { recursive: options.recursive }, () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      callback();
    }, options.delayMs);
  });

  watcher.on("error", () => {
    // Treat watcher errors as best-effort; subscriptions are refreshed separately.
  });

  return () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    watcher.close();
  };
};
