import type { QueryResult } from "../../../query";

export type WorkspaceRouteDialogState =
  | {
      focusPath: string | null;
      kind: "changes";
    }
  | null;

export interface WorkspaceRoutePresentationState {
  dialog: WorkspaceRouteDialogState;
}

const WORKSPACE_ROUTE_DIALOG_PARAM = "dialog";
const WORKSPACE_ROUTE_DIALOG_FOCUS_PATH_PARAM = "dialog-focus";
const WORKSPACE_ROUTE_DIALOG_CHANGES_VALUE = "changes";

export function hasBlockingQueryLoad<T>(
  query: Pick<QueryResult<T>, "data" | "isLoading">,
): boolean {
  return query.isLoading && query.data === undefined;
}

export function hasBlockingQueryError<T>(query: Pick<QueryResult<T>, "data" | "error">): boolean {
  return query.error !== null && query.error !== undefined && query.data === undefined;
}

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  return search instanceof URLSearchParams ? search : new URLSearchParams(search);
}

export function readWorkspaceRoutePresentationState(
  search: string | URLSearchParams,
): WorkspaceRoutePresentationState {
  const params = toSearchParams(search);
  const dialogKind = params.get(WORKSPACE_ROUTE_DIALOG_PARAM);
  const focusPath = params.get(WORKSPACE_ROUTE_DIALOG_FOCUS_PATH_PARAM);

  return {
    dialog:
      dialogKind === WORKSPACE_ROUTE_DIALOG_CHANGES_VALUE
        ? {
            focusPath,
            kind: "changes",
          }
        : null,
  };
}

export function writeWorkspaceRouteDialogState(
  search: string | URLSearchParams,
  dialog: WorkspaceRouteDialogState,
): URLSearchParams {
  const next = new URLSearchParams(toSearchParams(search));

  if (!dialog) {
    next.delete(WORKSPACE_ROUTE_DIALOG_PARAM);
    next.delete(WORKSPACE_ROUTE_DIALOG_FOCUS_PATH_PARAM);
    return next;
  }

  next.set(WORKSPACE_ROUTE_DIALOG_PARAM, dialog.kind);

  if (dialog.kind === "changes" && dialog.focusPath) {
    next.set(WORKSPACE_ROUTE_DIALOG_FOCUS_PATH_PARAM, dialog.focusPath);
  } else {
    next.delete(WORKSPACE_ROUTE_DIALOG_FOCUS_PATH_PARAM);
  }

  return next;
}
