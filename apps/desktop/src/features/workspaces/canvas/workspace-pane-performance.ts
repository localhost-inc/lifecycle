import { useEffect } from "react";

interface WorkspacePanePerformanceMeasure {
  durationMs: number;
  metadata: Record<string, string> | null;
  name: string;
  timestampMs: number;
}

interface WorkspacePanePerformancePendingTabSwitch {
  paneId: string;
  recordedMeasureNames: Record<string, true>;
  startedAtMs: number;
  tabKey: string;
}

interface WorkspacePanePerformanceStore {
  enabled: boolean;
  measures: WorkspacePanePerformanceMeasure[];
  pendingTabSwitch: WorkspacePanePerformancePendingTabSwitch | null;
  renderCounts: Record<string, number>;
}

interface WorkspacePanePerformanceSnapshot {
  enabled: boolean;
  measures: WorkspacePanePerformanceMeasure[];
  pendingTabSwitch:
    | {
        paneId: string;
        startedAtMs: number;
        tabKey: string;
      }
    | null;
  renderCounts: Record<string, number>;
}

declare global {
  var __LIFECYCLE_PANE_PERF__: WorkspacePanePerformanceStore | undefined;
}

const MAX_WORKSPACE_PANE_PERF_MEASURES = 200;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function trimMeasures(measures: WorkspacePanePerformanceMeasure[]) {
  if (measures.length <= MAX_WORKSPACE_PANE_PERF_MEASURES) {
    return measures;
  }

  measures.splice(0, measures.length - MAX_WORKSPACE_PANE_PERF_MEASURES);
  return measures;
}

function getWorkspacePanePerformanceStore(): WorkspacePanePerformanceStore {
  globalThis.__LIFECYCLE_PANE_PERF__ ??= {
    enabled: false,
    measures: [],
    pendingTabSwitch: null,
    renderCounts: {},
  };

  return globalThis.__LIFECYCLE_PANE_PERF__;
}

function pushWorkspacePanePerformanceMeasure(
  name: string,
  durationMs: number,
  metadata: Record<string, string> | null = null,
) {
  const store = getWorkspacePanePerformanceStore();
  trimMeasures(store.measures).push({
    durationMs,
    metadata,
    name,
    timestampMs: nowMs(),
  });
}

function buildSwitchMetadata(
  pendingTabSwitch: WorkspacePanePerformancePendingTabSwitch,
): Record<string, string> {
  return {
    paneId: pendingTabSwitch.paneId,
    tabKey: pendingTabSwitch.tabKey,
  };
}

export function setWorkspacePanePerformanceEnabled(enabled: boolean) {
  getWorkspacePanePerformanceStore().enabled = enabled;
}

export function resetWorkspacePanePerformance() {
  const store = getWorkspacePanePerformanceStore();
  store.measures = [];
  store.pendingTabSwitch = null;
  store.renderCounts = {};
}

export function readWorkspacePanePerformanceSnapshot(): WorkspacePanePerformanceSnapshot {
  const store = getWorkspacePanePerformanceStore();

  return {
    enabled: store.enabled,
    measures: [...store.measures],
    pendingTabSwitch: store.pendingTabSwitch
      ? {
          paneId: store.pendingTabSwitch.paneId,
          startedAtMs: store.pendingTabSwitch.startedAtMs,
          tabKey: store.pendingTabSwitch.tabKey,
        }
      : null,
    renderCounts: { ...store.renderCounts },
  };
}

export function beginWorkspacePaneTabSwitchTrace(input: { paneId: string; tabKey: string }) {
  const store = getWorkspacePanePerformanceStore();
  if (!store.enabled) {
    return;
  }

  store.pendingTabSwitch = {
    paneId: input.paneId,
    recordedMeasureNames: {},
    startedAtMs: nowMs(),
    tabKey: input.tabKey,
  };
}

export function completeWorkspacePaneTabSwitchStage(
  stageName: string,
  input: {
    clearPending?: boolean;
    paneId?: string;
    tabKey?: string;
  } = {},
) {
  const store = getWorkspacePanePerformanceStore();
  const pendingTabSwitch = store.pendingTabSwitch;
  if (!store.enabled || !pendingTabSwitch) {
    return null;
  }

  if (input.paneId && pendingTabSwitch.paneId !== input.paneId) {
    return null;
  }

  if (input.tabKey && pendingTabSwitch.tabKey !== input.tabKey) {
    return null;
  }

  const measureName = `tab-switch:${stageName}`;
  if (pendingTabSwitch.recordedMeasureNames[measureName]) {
    return null;
  }

  pendingTabSwitch.recordedMeasureNames[measureName] = true;
  const durationMs = nowMs() - pendingTabSwitch.startedAtMs;
  pushWorkspacePanePerformanceMeasure(measureName, durationMs, buildSwitchMetadata(pendingTabSwitch));

  if (input.clearPending) {
    store.pendingTabSwitch = null;
  }

  return durationMs;
}

export function measureActiveWorkspacePaneComputation<T>(name: string, compute: () => T): T {
  const store = getWorkspacePanePerformanceStore();
  const pendingTabSwitch = store.pendingTabSwitch;
  if (!store.enabled || !pendingTabSwitch) {
    return compute();
  }

  const measureName = `tab-switch:${name}`;
  if (pendingTabSwitch.recordedMeasureNames[measureName]) {
    return compute();
  }

  const startedAtMs = nowMs();
  const result = compute();
  pendingTabSwitch.recordedMeasureNames[measureName] = true;
  pushWorkspacePanePerformanceMeasure(
    measureName,
    nowMs() - startedAtMs,
    buildSwitchMetadata(pendingTabSwitch),
  );
  return result;
}

export function useWorkspacePaneRenderCount(componentName: string, instanceId: string) {
  useEffect(() => {
    const store = getWorkspacePanePerformanceStore();
    if (!store.enabled) {
      return;
    }

    const key = `${componentName}:${instanceId}`;
    store.renderCounts[key] = (store.renderCounts[key] ?? 0) + 1;
  });
}
