const LIFECYCLE_PERF_PREFIX = "lifecycle";

function supportsUserTiming(): boolean {
  return typeof performance !== "undefined";
}

function debugEnabled(): boolean {
  return Boolean(import.meta.env.DEV);
}

function markName(name: string): string {
  return `${LIFECYCLE_PERF_PREFIX}:${name}`;
}

export function markPerformance(name: string): void {
  if (!supportsUserTiming()) {
    return;
  }

  performance.mark(markName(name));
}

export function measurePerformance(
  name: string,
  startMark: string,
  endMark: string,
): number | null {
  if (!supportsUserTiming()) {
    return null;
  }

  const measure = markName(name);
  const start = markName(startMark);
  const end = markName(endMark);

  try {
    performance.measure(measure, start, end);
  } catch {
    return null;
  }

  const entry = performance.getEntriesByName(measure).at(-1);
  if (!entry) {
    return null;
  }

  if (debugEnabled()) {
    console.debug(`[perf] ${name}: ${entry.duration.toFixed(1)}ms`);
  }

  return entry.duration;
}

export async function measureAsyncPerformance<T>(
  name: string,
  callback: () => Promise<T>,
): Promise<T> {
  const start = `${name}:start`;
  const end = `${name}:end`;
  markPerformance(start);

  try {
    return await callback();
  } finally {
    markPerformance(end);
    measurePerformance(name, start, end);
  }
}

