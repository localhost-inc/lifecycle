import { Alert, AlertDescription } from "@lifecycle/ui";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileRendererDefinition } from "@/features/explorer/renderers/file-renderer-types";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface PenNode {
  id: string;
  type: string;
  name?: string;
  enabled?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  cornerRadius?: number;
  clipContent?: boolean;
  opacity?: number;
  rotation?: number;
  layout?: "none" | "vertical" | "horizontal";
  gap?: number;
  padding?: number | [number, number, number, number];
  alignItems?: string;
  justifyContent?: string;
  children?: PenNode[];
  content?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  letterSpacing?: number;
  lineHeight?: number;
}

interface PenDocument {
  version?: string;
  children?: PenNode[];
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePenDocument(content: string): PenDocument | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) return null;
    return parsed as PenDocument;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Canvas bounds                                                       */
/* ------------------------------------------------------------------ */

function computeCanvasBounds(nodes: PenNode[]): { width: number; height: number } {
  let maxRight = 0;
  let maxBottom = 0;

  for (const node of nodes) {
    const right = (node.x ?? 0) + (node.width ?? 0);
    const bottom = (node.y ?? 0) + (node.height ?? 0);
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  }

  return { width: maxRight || 400, height: maxBottom || 300 };
}

/* ------------------------------------------------------------------ */
/* Style resolvers                                                     */
/* ------------------------------------------------------------------ */

function resolvePadding(
  padding: number | [number, number, number, number] | undefined,
): string | undefined {
  if (padding == null) return undefined;
  if (typeof padding === "number") return `${padding}px`;
  const [top, right, bottom, left] = padding;
  return `${top}px ${right}px ${bottom}px ${left}px`;
}

function resolveContainerStyle(node: PenNode, parentLayout: string | undefined): CSSProperties {
  const style: CSSProperties = {};
  const isFlexChild = parentLayout === "horizontal" || parentLayout === "vertical";

  if (!isFlexChild) {
    style.position = "absolute";
    if (node.x != null) style.left = node.x;
    if (node.y != null) style.top = node.y;
  }

  if (typeof node.width === "number") style.width = node.width;
  if (typeof node.height === "number") style.height = node.height;
  if (typeof node.fill === "string") style.backgroundColor = node.fill;
  if (node.cornerRadius != null) style.borderRadius = node.cornerRadius;
  if (node.clipContent) style.overflow = "hidden";
  if (node.opacity != null) style.opacity = node.opacity;
  if (node.rotation != null) style.transform = `rotate(${node.rotation}deg)`;

  const pad = resolvePadding(node.padding);
  if (pad) style.padding = pad;

  const hasFlexLayout = node.layout === "horizontal" || node.layout === "vertical";

  if (hasFlexLayout) {
    style.display = "flex";
    style.flexDirection = node.layout === "horizontal" ? "row" : "column";
    if (node.gap != null) style.gap = node.gap;
    if (node.alignItems) style.alignItems = node.alignItems as CSSProperties["alignItems"];
    if (node.justifyContent)
      style.justifyContent = node.justifyContent as CSSProperties["justifyContent"];
  } else if (node.children?.length && isFlexChild) {
    style.position = "relative";
  }

  return style;
}

function resolveTextStyle(node: PenNode, parentLayout: string | undefined): CSSProperties {
  const style: CSSProperties = {};
  const isFlexChild = parentLayout === "horizontal" || parentLayout === "vertical";

  if (!isFlexChild) {
    style.position = "absolute";
    if (node.x != null) style.left = node.x;
    if (node.y != null) style.top = node.y;
  }

  if (typeof node.width === "number") style.width = node.width;
  if (typeof node.height === "number") style.height = node.height;
  if (typeof node.fill === "string") style.color = node.fill;
  if (node.fontSize != null) style.fontSize = node.fontSize;
  if (node.fontWeight != null) style.fontWeight = node.fontWeight;
  if (node.fontFamily) style.fontFamily = node.fontFamily;
  if (node.letterSpacing != null) style.letterSpacing = `${node.letterSpacing}em`;
  if (node.lineHeight != null) style.lineHeight = node.lineHeight;
  if (node.opacity != null) style.opacity = node.opacity;
  style.whiteSpace = "pre-wrap";
  style.margin = 0;
  style.flexShrink = 0;

  return style;
}

/* ------------------------------------------------------------------ */
/* Node renderer                                                       */
/* ------------------------------------------------------------------ */

function PenNodeView({ node, parentLayout }: { node: PenNode; parentLayout?: string }) {
  if (node.enabled === false) return null;

  if (node.type === "text") {
    return (
      <span data-pen-id={node.id} style={resolveTextStyle(node, parentLayout)}>
        {node.content ?? ""}
      </span>
    );
  }

  if (node.type === "ellipse") {
    const style = resolveContainerStyle(node, parentLayout);
    style.borderRadius = "50%";
    return <div data-pen-id={node.id} style={style} />;
  }

  const style = resolveContainerStyle(node, parentLayout);
  const childLayout =
    node.layout === "horizontal" || node.layout === "vertical" ? node.layout : undefined;

  return (
    <div data-pen-id={node.id} style={style}>
      {node.children?.map((child) => (
        <PenNodeView key={child.id} node={child} parentLayout={childLayout} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Document summary (exported for tests)                               */
/* ------------------------------------------------------------------ */

interface PencilDocumentSummary {
  nodeCount: number;
  title: string | null;
  topLevelKeys: string[];
  topTypes: Array<{ count: number; type: string }>;
  uniqueTypeCount: number;
  version: string | null;
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

function firstScalarString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
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

  if (!isRecord(parsed)) return null;

  const typeCounts = new Map<string, number>();
  let nodeCount = 0;

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;

    const nodeType = typeof value.type === "string" ? value.type : null;
    if (nodeType) {
      nodeCount += 1;
      typeCounts.set(nodeType, (typeCounts.get(nodeType) ?? 0) + 1);
    }
    for (const child of Object.values(value)) visit(child);
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

/* ------------------------------------------------------------------ */
/* Pan / zoom canvas                                                   */
/* ------------------------------------------------------------------ */

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_SENSITIVITY = 0.002;

export function PencilFileRendererView({ content }: { content: string; filePath: string }) {
  const doc = useMemo(() => parsePenDocument(content), [content]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragging = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );

  const bounds = useMemo(
    () => (doc?.children?.length ? computeCanvasBounds(doc.children) : null),
    [doc],
  );

  // Fit content on mount / content change
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !bounds) return;

    const rect = el.getBoundingClientRect();
    const padded = 64;
    const scaleX = rect.width / (bounds.width + padded);
    const scaleY = rect.height / (bounds.height + padded);
    const fit = Math.min(scaleX, scaleY, 1);

    setZoom(fit);
    setPan({
      x: (rect.width - bounds.width * fit) / 2,
      y: (rect.height - bounds.height * fit) / 2,
    });
  }, [bounds]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      dragging.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pan],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const delta = -e.deltaY * ZOOM_SENSITIVITY;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));
      const ratio = next / zoom;

      setPan({ x: mx - ratio * (mx - pan.x), y: my - ratio * (my - pan.y) });
      setZoom(next);
    },
    [pan, zoom],
  );

  if (!doc?.children?.length) {
    return (
      <div className="px-5 py-5">
        <Alert>
          <AlertDescription>
            This <code>.pen</code> file could not be parsed or contains no renderable objects.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      style={{
        backgroundColor: "var(--surface)",
        cursor: dragging.current ? "grabbing" : "grab",
        minHeight: "100%",
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "relative",
          width: bounds!.width,
          height: bounds!.height,
        }}
      >
        {doc.children.map((node) => (
          <PenNodeView key={node.id} node={node} parentLayout={undefined} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Renderer definition                                                 */
/* ------------------------------------------------------------------ */

export const pencilFileRenderer: FileRendererDefinition = {
  editor: {
    language: "json",
  },
  extensions: ["pen"],
  kind: "pencil",
  label: "Pencil",
  supportsViewMode: true,
  ViewComponent: PencilFileRendererView,
};
