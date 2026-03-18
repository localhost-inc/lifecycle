import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface WorkspaceToolbarRunAction {
  label: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}

export interface WorkspaceToolbarGitAction {
  label: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}

export interface WorkspaceToolbarSlot {
  runAction: WorkspaceToolbarRunAction | null;
  restartAction: { disabled: boolean; onClick: () => void } | null;
  gitAction: WorkspaceToolbarGitAction | null;
}

interface WorkspaceToolbarContextValue {
  registerToolbarSlot: (workspaceId: string, slot: WorkspaceToolbarSlot) => void;
  unregisterToolbarSlot: (workspaceId: string) => void;
  slotsByWorkspaceId: Record<string, WorkspaceToolbarSlot>;
}

export function areWorkspaceToolbarSlotsEqual(
  current: WorkspaceToolbarSlot | undefined,
  next: WorkspaceToolbarSlot,
): boolean {
  if (!current) {
    return false;
  }

  return (
    current.runAction === next.runAction &&
    current.restartAction === next.restartAction &&
    current.gitAction === next.gitAction
  );
}

export function upsertWorkspaceToolbarSlot(
  current: Record<string, WorkspaceToolbarSlot>,
  workspaceId: string,
  slot: WorkspaceToolbarSlot,
): Record<string, WorkspaceToolbarSlot> {
  if (areWorkspaceToolbarSlotsEqual(current[workspaceId], slot)) {
    return current;
  }

  return {
    ...current,
    [workspaceId]: slot,
  };
}

export function removeWorkspaceToolbarSlot(
  current: Record<string, WorkspaceToolbarSlot>,
  workspaceId: string,
): Record<string, WorkspaceToolbarSlot> {
  if (!(workspaceId in current)) {
    return current;
  }

  const next = { ...current };
  delete next[workspaceId];
  return next;
}

const WorkspaceToolbarContext = createContext<WorkspaceToolbarContextValue | null>(null);

export function WorkspaceToolbarProvider({ children }: { children: ReactNode }) {
  const [slotsByWorkspaceId, setSlotsByWorkspaceId] = useState<
    Record<string, WorkspaceToolbarSlot>
  >({});

  const registerToolbarSlot = useCallback((workspaceId: string, slot: WorkspaceToolbarSlot) => {
    setSlotsByWorkspaceId((current) => upsertWorkspaceToolbarSlot(current, workspaceId, slot));
  }, []);

  const unregisterToolbarSlot = useCallback((workspaceId: string) => {
    setSlotsByWorkspaceId((current) => removeWorkspaceToolbarSlot(current, workspaceId));
  }, []);

  const value = useMemo<WorkspaceToolbarContextValue>(
    () => ({
      registerToolbarSlot,
      slotsByWorkspaceId,
      unregisterToolbarSlot,
    }),
    [registerToolbarSlot, slotsByWorkspaceId, unregisterToolbarSlot],
  );

  return (
    <WorkspaceToolbarContext.Provider value={value}>{children}</WorkspaceToolbarContext.Provider>
  );
}

export function useWorkspaceToolbar(): WorkspaceToolbarContextValue {
  const value = useContext(WorkspaceToolbarContext);
  if (!value) {
    throw new Error("useWorkspaceToolbar must be used within a WorkspaceToolbarProvider");
  }

  return value;
}

export function useWorkspaceToolbarSlot(workspaceId: string | null): WorkspaceToolbarSlot | null {
  const { slotsByWorkspaceId } = useWorkspaceToolbar();
  return workspaceId ? (slotsByWorkspaceId[workspaceId] ?? null) : null;
}
