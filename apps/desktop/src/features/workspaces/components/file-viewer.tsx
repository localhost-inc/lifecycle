import { Alert, AlertDescription, Badge, Button, EmptyState } from "@lifecycle/ui";
import { ExternalLink, FileJson, FileText, RefreshCcw } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { openWorkspaceFile } from "../api";
import { useWorkspaceFile } from "../hooks";
import {
  workspaceFileBasename,
  workspaceFileDirname,
  workspaceFileExtension,
} from "../lib/workspace-file-paths";

const MarkdownFileRenderer = lazy(async () => {
  const module = await import("./markdown-file-renderer");
  return { default: module.MarkdownFileRenderer };
});

export type FileViewerRendererKind = "markdown" | "pencil" | "text";

interface PencilDocumentSummary {
  nodeCount: number;
  title: string | null;
  topLevelKeys: string[];
  topTypes: Array<{ count: number; type: string }>;
  uniqueTypeCount: number;
  version: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function firstScalarString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }

  return null;
}

function sortTypeCounts(
  left: { count: number; type: string },
  right: { count: number; type: string },
): number {
  return right.count - left.count || left.type.localeCompare(right.type);
}

export function resolveFileViewerRenderer(filePath: string): FileViewerRendererKind {
  const extension = workspaceFileExtension(filePath);
  if (extension === "md") {
    return "markdown";
  }

  if (extension === "pen") {
    return "pencil";
  }

  return "text";
}

export function summarizePencilDocument(content: string): PencilDocumentSummary | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const typeCounts = new Map<string, number>();
  let nodeCount = 0;

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    const nodeType = typeof value.type === "string" ? value.type : null;
    if (nodeType) {
      nodeCount += 1;
      typeCounts.set(nodeType, (typeCounts.get(nodeType) ?? 0) + 1);
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  };

  visit(parsed);

  const meta = isRecord(parsed.meta) ? parsed.meta : null;

  return {
    nodeCount,
    title: firstString([parsed.name, parsed.title, meta?.name, meta?.title]),
    topLevelKeys: Object.keys(parsed).slice(0, 8),
    topTypes: [...typeCounts.entries()]
      .map(([type, count]) => ({ count, type }))
      .sort(sortTypeCounts)
      .slice(0, 6),
    uniqueTypeCount: typeCounts.size,
    version: firstScalarString([parsed.version, parsed.schemaVersion, meta?.version]),
  };
}

function rendererLabel(renderer: FileViewerRendererKind): string {
  switch (renderer) {
    case "markdown":
      return "Markdown";
    case "pencil":
      return "Pencil";
    default:
      return "Plain Text";
  }
}

function RendererBadge({ renderer }: { renderer: FileViewerRendererKind }) {
  return <Badge variant="outline">{rendererLabel(renderer)}</Badge>;
}

function SummaryCard({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-[var(--foreground)]">{value ?? "Unknown"}</p>
    </div>
  );
}

function PencilFileRenderer({ content, filePath }: { content: string; filePath: string }) {
  const summary = useMemo(() => summarizePencilDocument(content), [content]);

  return (
    <div className="px-5 py-5">
      {summary ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard
              label="Document"
              value={summary.title ?? workspaceFileBasename(filePath)}
            />
            <SummaryCard label="Version" value={summary.version} />
            <SummaryCard label="Typed Nodes" value={summary.nodeCount} />
            <SummaryCard label="Node Types" value={summary.uniqueTypeCount} />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5">
              <div className="flex items-center gap-2">
                <FileJson className="h-4 w-4 text-[var(--muted-foreground)]" />
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Pencil document</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                `.pen` files are JSON-backed Pencil documents. This viewer summarizes the object
                graph and keeps the raw payload available below.
              </p>
              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Top-level keys
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {summary.topLevelKeys.map((key) => (
                    <Badge key={key} variant="muted">
                      {key}
                    </Badge>
                  ))}
                </div>
              </div>
            </section>

            <aside className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Common node types</h3>
              {summary.topTypes.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.topTypes.map((entry) => (
                    <div
                      key={entry.type}
                      className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-[var(--foreground)]">{entry.type}</span>
                      <span className="text-[var(--muted-foreground)]">{entry.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                  No typed nodes were found in this document.
                </p>
              )}
            </aside>
          </div>
        </>
      ) : (
        <Alert className="mb-5">
          <AlertDescription>
            This `.pen` file could not be parsed as JSON. Showing the raw document payload below.
          </AlertDescription>
        </Alert>
      )}

      <section className="mt-5 rounded-3xl border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Raw JSON</h3>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-xs leading-6 text-[var(--foreground)]">
          {content}
        </pre>
      </section>
    </div>
  );
}

function TextFileRenderer({ content }: { content: string }) {
  return (
    <pre className="px-5 py-5 font-mono text-xs leading-6 text-[var(--foreground)]">{content}</pre>
  );
}

interface FileViewerProps {
  filePath: string;
  initialScrollTop?: number;
  onScrollTopChange?: (scrollTop: number) => void;
  workspaceId: string;
}

export function getFileViewerScrollRestoreKey({
  filePath,
  isLoading,
  renderer,
}: {
  filePath: string;
  isLoading: boolean;
  renderer: FileViewerRendererKind;
}): string | null {
  return isLoading ? null : `${renderer}:${filePath}`;
}

export function FileViewer({
  filePath,
  initialScrollTop = 0,
  onScrollTopChange,
  workspaceId,
}: FileViewerProps) {
  const [openError, setOpenError] = useState<string | null>(null);
  const restoredScrollKeyRef = useRef<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileQuery = useWorkspaceFile(workspaceId, filePath);
  const renderer = resolveFileViewerRenderer(filePath);
  const displayPath = fileQuery.data?.file_path ?? filePath;
  const fileName = workspaceFileBasename(displayPath);
  const directoryName = workspaceFileDirname(displayPath);
  const extension = fileQuery.data?.extension ?? workspaceFileExtension(displayPath);

  const handleOpenExternally = async () => {
    setOpenError(null);

    try {
      await openWorkspaceFile(workspaceId, displayPath);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    const restoreKey = getFileViewerScrollRestoreKey({
      filePath: displayPath,
      isLoading: fileQuery.isLoading,
      renderer,
    });
    if (!viewport || restoreKey === null || restoredScrollKeyRef.current === restoreKey) {
      return;
    }

    viewport.scrollTop = initialScrollTop;
    restoredScrollKeyRef.current = restoreKey;
  }, [displayPath, fileQuery.isLoading, initialScrollTop, renderer]);

  const handleViewportScroll = (scrollTop: number) => {
    onScrollTopChange?.(scrollTop);
  };

  const content = fileQuery.isLoading ? (
    <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
      Loading file...
    </div>
  ) : fileQuery.error ? (
    <Alert className="m-5" variant="destructive">
      <AlertDescription>Failed to load file: {String(fileQuery.error)}</AlertDescription>
    </Alert>
  ) : !fileQuery.data ? (
    <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
      File unavailable.
    </div>
  ) : fileQuery.data.is_too_large ? (
    <div className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        description={`This file is ${Intl.NumberFormat().format(fileQuery.data.byte_len)} bytes. Lifecycle currently previews text files up to 1 MB inline.`}
        icon={<FileText />}
        size="sm"
        title="File too large to preview"
      />
    </div>
  ) : fileQuery.data.is_binary || fileQuery.data.content === null ? (
    <div className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        description="This file does not look like UTF-8 text, so Lifecycle is leaving it to your default app for now."
        icon={<FileText />}
        size="sm"
        title="Binary preview unavailable"
      />
    </div>
  ) : renderer === "markdown" ? (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
          Loading markdown preview...
        </div>
      }
    >
      <MarkdownFileRenderer content={fileQuery.data.content} />
    </Suspense>
  ) : renderer === "pencil" ? (
    <PencilFileRenderer content={fileQuery.data.content} filePath={displayPath} />
  ) : (
    <TextFileRenderer content={fileQuery.data.content} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
      <header className="border-b border-[var(--border)] px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              File Viewer
            </p>
            <h2 className="mt-2 truncate text-base font-semibold leading-snug text-[var(--foreground)]">
              {fileName}
            </h2>
            <p className="mt-1.5 truncate text-xs text-[var(--muted-foreground)]">
              {directoryName || "Workspace root"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RendererBadge renderer={renderer} />
              {extension ? <Badge variant="muted">.{extension}</Badge> : null}
              {fileQuery.data ? (
                <Badge variant="outline">
                  {Intl.NumberFormat().format(fileQuery.data.byte_len)} bytes
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              disabled={fileQuery.isLoading}
              onClick={() => {
                void fileQuery.refresh();
              }}
              size="sm"
              variant="outline"
            >
              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
              Reload
            </Button>
            <Button onClick={() => void handleOpenExternally()} size="sm" variant="outline">
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open Externally
            </Button>
          </div>
        </div>

        {openError ? (
          <Alert className="mt-3" variant="destructive">
            <AlertDescription>{openError}</AlertDescription>
          </Alert>
        ) : null}
      </header>

      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-auto"
        onScroll={(event) => {
          handleViewportScroll(event.currentTarget.scrollTop);
        }}
      >
        {content}
      </div>
    </div>
  );
}
