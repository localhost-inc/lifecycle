import type { LifecycleConfig, ServiceRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { GitFork } from "lucide-react";
import { useMemo } from "react";

interface GraphTabProps {
  config: LifecycleConfig | null;
  services: ServiceRecord[];
}

interface GraphNode {
  name: string;
  kind: "service" | "task";
  port: number | null;
  layer: number;
  column: number;
}

interface GraphEdge {
  from: string;
  to: string;
}

interface GraphLayout {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  layerCount: number;
  maxColumnsInLayer: number;
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 36;
const HORIZONTAL_GAP = 24;
const VERTICAL_GAP = 48;
const PADDING_X = 28;
const PADDING_Y = 28;
const STATUS_DOT_R = 3.5;

function computeLayout(environment: LifecycleConfig["environment"]): GraphLayout {
  const entries = Object.entries(environment);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const [name, node] of entries) {
    const port = "port" in node && typeof node.port === "number" ? node.port : null;
    nodes.set(name, { name, kind: node.kind, port, layer: 0, column: 0 });
    adjacency.set(name, []);
    inDegree.set(name, 0);
  }

  for (const [name, node] of entries) {
    const deps = node.depends_on;
    if (!deps) continue;
    for (const dep of deps) {
      if (!nodes.has(dep)) continue;
      adjacency.get(dep)!.push(name);
      edges.push({ from: dep, to: name });
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const layerMap = new Map<string, number>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layerMap.get(current) ?? 0;
    const node = nodes.get(current)!;
    node.layer = currentLayer;

    for (const neighbor of adjacency.get(current) ?? []) {
      const neighborLayer = Math.max(layerMap.get(neighbor) ?? 0, currentLayer + 1);
      layerMap.set(neighbor, neighborLayer);
      const remaining = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, remaining);
      if (remaining === 0) queue.push(neighbor);
    }
  }

  const layers = new Map<number, string[]>();
  let layerCount = 0;
  for (const [, node] of nodes) {
    const layer = node.layer;
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(node.name);
    if (layer + 1 > layerCount) layerCount = layer + 1;
  }

  let maxColumnsInLayer = 0;
  for (const [, members] of layers) {
    if (members.length > maxColumnsInLayer) maxColumnsInLayer = members.length;
    members.forEach((name, i) => {
      nodes.get(name)!.column = i;
    });
  }

  return { nodes, edges, layerCount, maxColumnsInLayer };
}

function nodeX(column: number, columnsInLayer: number, totalWidth: number): number {
  const layerWidth = columnsInLayer * NODE_WIDTH + (columnsInLayer - 1) * HORIZONTAL_GAP;
  const offsetX = (totalWidth - layerWidth) / 2;
  return offsetX + column * (NODE_WIDTH + HORIZONTAL_GAP) + NODE_WIDTH / 2;
}

function nodeY(layer: number): number {
  return PADDING_Y + layer * (NODE_HEIGHT + VERTICAL_GAP) + NODE_HEIGHT / 2;
}

/** Resolves a status string to its dot fill color (theme variable). */
function statusDotFill(status: ServiceRecord["status"] | undefined): string {
  switch (status) {
    case "ready":
      return "var(--status-success)";
    case "starting":
      return "var(--status-info)";
    case "failed":
      return "var(--status-danger)";
    default:
      return "var(--status-neutral)";
  }
}

export function GraphTab({ config, services }: GraphTabProps) {
  const layout = useMemo(() => {
    if (!config || Object.keys(config.environment).length === 0) return null;
    return computeLayout(config.environment);
  }, [config]);

  if (!layout) {
    return (
      <EmptyState
        description="Define environment nodes with depends_on in lifecycle.json to see the dependency graph."
        icon={<GitFork />}
        size="sm"
        title="No environment graph"
      />
    );
  }

  const statusMap = new Map<string, ServiceRecord["status"]>();
  for (const svc of services) {
    statusMap.set(svc.service_name, svc.status);
  }

  const { nodes, edges, layerCount, maxColumnsInLayer } = layout;

  const svgWidth = Math.max(
    maxColumnsInLayer * NODE_WIDTH + (maxColumnsInLayer - 1) * HORIZONTAL_GAP + PADDING_X * 2,
    200,
  );
  const svgHeight = layerCount * NODE_HEIGHT + (layerCount - 1) * VERTICAL_GAP + PADDING_Y * 2;

  const layerColumns = new Map<number, number>();
  for (const [, node] of nodes) {
    layerColumns.set(node.layer, Math.max(layerColumns.get(node.layer) ?? 0, node.column + 1));
  }

  return (
    <div className="flex items-center justify-center py-3">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width="100%"
        style={{ maxWidth: svgWidth, maxHeight: svgHeight }}
      >
        <defs>
          <filter id="graph-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#000" floodOpacity="0.08" />
          </filter>
          <marker id="graph-arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <path
              d="M0,0.8 L5.2,3 L0,5.2"
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth="1.2"
              opacity="0.4"
            />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge) => {
          const fromNode = nodes.get(edge.from)!;
          const toNode = nodes.get(edge.to)!;
          const fromCols = layerColumns.get(fromNode.layer) ?? 1;
          const toCols = layerColumns.get(toNode.layer) ?? 1;

          const x1 = nodeX(fromNode.column, fromCols, svgWidth);
          const y1 = nodeY(fromNode.layer) + NODE_HEIGHT / 2;
          const x2 = nodeX(toNode.column, toCols, svgWidth);
          const y2 = nodeY(toNode.layer) - NODE_HEIGHT / 2;

          const midY = (y1 + y2) / 2;
          const toStatus = statusMap.get(edge.to);
          const isActive = toStatus === "starting" || toStatus === "ready";

          const pathD = `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
          const flowClass = isActive ? "graph-edge-flow-active" : "graph-edge-flow-idle";

          return (
            <g key={`${edge.from}->${edge.to}`}>
              {/* Base line */}
              <path
                d={pathD}
                fill="none"
                stroke="var(--muted-foreground)"
                strokeWidth={1.2}
                opacity={isActive ? 0.3 : 0.12}
                markerEnd="url(#graph-arrow)"
              />
              {/* Marching-dots overlay */}
              <path
                d={pathD}
                fill="none"
                stroke={
                  toStatus === "ready"
                    ? "var(--status-success)"
                    : toStatus === "starting"
                      ? "var(--status-info)"
                      : "var(--status-neutral)"
                }
                strokeWidth={isActive ? 1.6 : 1}
                strokeDasharray={isActive ? "3 10" : "2 12"}
                strokeLinecap="round"
                opacity={isActive ? 0.7 : 0.2}
                className={flowClass}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {Array.from(nodes.values()).map((node) => {
          const cols = layerColumns.get(node.layer) ?? 1;
          const cx = nodeX(node.column, cols, svgWidth);
          const cy = nodeY(node.layer);
          const status = statusMap.get(node.name);
          const isStarting = status === "starting";
          const isTask = node.kind === "task";
          const dotFill = statusDotFill(status);

          const label = node.name.length > 14 ? `${node.name.slice(0, 13)}...` : node.name;
          const portLabel = node.port !== null ? `:${node.port}` : null;

          // Text layout: name left-aligned after dot, port right-aligned
          const textAreaLeft = cx - NODE_WIDTH / 2 + 18;

          return (
            <g key={node.name} className={isStarting ? "graph-node-starting" : undefined}>
              {/* Card */}
              <rect
                x={cx - NODE_WIDTH / 2}
                y={cy - NODE_HEIGHT / 2}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={10}
                ry={10}
                fill="var(--background)"
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray={isTask ? "4 3" : undefined}
                filter="url(#graph-shadow)"
              />

              {/* Status dot */}
              <circle
                cx={cx - NODE_WIDTH / 2 + 12}
                cy={cy}
                r={STATUS_DOT_R}
                fill={dotFill}
                className={isStarting ? "graph-dot-pulse" : undefined}
              />

              {/* Service name */}
              <text
                x={textAreaLeft}
                y={cy + (portLabel ? 0.5 : 0.5)}
                dominantBaseline="central"
                fill="var(--foreground)"
                fontSize={11}
                fontWeight={500}
                fontFamily="inherit"
                letterSpacing="-0.01em"
              >
                {label}
              </text>

              {/* Port badge */}
              {portLabel && (
                <text
                  x={cx + NODE_WIDTH / 2 - 10}
                  y={cy + 0.5}
                  textAnchor="end"
                  dominantBaseline="central"
                  fill="var(--muted-foreground)"
                  fontSize={9}
                  fontFamily="ui-monospace, monospace"
                  opacity={0.55}
                >
                  {portLabel}
                </text>
              )}
            </g>
          );
        })}

        <style>{`
          .graph-edge-flow-active {
            animation: graph-march-active 0.8s linear infinite;
          }
          .graph-edge-flow-idle {
            animation: graph-march-idle 2.4s linear infinite;
          }
          @keyframes graph-march-active {
            to { stroke-dashoffset: -13; }
          }
          @keyframes graph-march-idle {
            to { stroke-dashoffset: -14; }
          }
          .graph-node-starting > rect {
            animation: graph-rect-pulse 2s ease-in-out infinite;
          }
          .graph-dot-pulse {
            animation: graph-dot-scale 2s ease-in-out infinite;
            transform-box: fill-box;
            transform-origin: center;
          }
          @keyframes graph-rect-pulse {
            0%, 100% { stroke-opacity: 1; }
            50% { stroke-opacity: 0.4; }
          }
          @keyframes graph-dot-scale {
            0%, 100% { opacity: 1; r: ${STATUS_DOT_R}; }
            50% { opacity: 0.5; r: ${STATUS_DOT_R + 1}; }
          }
        `}</style>
      </svg>
    </div>
  );
}
