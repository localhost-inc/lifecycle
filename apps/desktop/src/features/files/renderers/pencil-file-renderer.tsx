import { Alert, AlertDescription, Badge } from "@lifecycle/ui";
import { PencilRuler } from "lucide-react";
import { useMemo } from "react";
import { workspaceFileBasename } from "../../workspaces/lib/workspace-file-paths";
import type { FileRendererDefinition } from "./file-renderer-types";

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

function SummaryCard({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-[var(--foreground)]">{value ?? "Unknown"}</p>
    </div>
  );
}

export function PencilFileRendererView({
  content,
  filePath,
}: {
  content: string;
  filePath: string;
}) {
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
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2">
                <PencilRuler className="h-4 w-4 text-[var(--muted-foreground)]" />
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

            <aside className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
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

      <section className="mt-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
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

export const pencilFileRenderer: FileRendererDefinition = {
  editor: {
    language: "json",
  },
  editNotice:
    "Pencil editing currently opens the raw JSON source in CodeMirror. The structured document preview is still available in view mode.",
  extensions: ["pen"],
  kind: "pencil",
  label: "Pencil",
  supportsViewMode: true,
  ViewComponent: PencilFileRendererView,
};
