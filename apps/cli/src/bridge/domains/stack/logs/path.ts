import { resolve } from "node:path";

export interface StackLogScope {
  organizationSlug?: string | null;
  repositorySlug: string;
  workspaceSlug: string;
}

export type StackLogStream = "stderr" | "stdout";

function nonEmptySegment(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function stackLogPathSegments(scope: StackLogScope): string[] {
  const segments = ["logs"];
  const organizationSlug = scope.organizationSlug?.trim();
  if (organizationSlug && organizationSlug.length > 0) {
    segments.push(organizationSlug);
  }
  segments.push(
    nonEmptySegment(scope.repositorySlug, "repository"),
    nonEmptySegment(scope.workspaceSlug, "workspace"),
  );
  return segments;
}

export function stackLogDir(rootPath: string, scope: StackLogScope): string {
  return resolve(rootPath, ...stackLogPathSegments(scope));
}

export function stackLogFileName(serviceName: string, stream: StackLogStream): string {
  return `${encodeURIComponent(serviceName)}.${stream}.log`;
}

export function stackLogFilePath(
  rootPath: string,
  scope: StackLogScope,
  serviceName: string,
  stream: StackLogStream,
): string {
  return resolve(stackLogDir(rootPath, scope), stackLogFileName(serviceName, stream));
}
