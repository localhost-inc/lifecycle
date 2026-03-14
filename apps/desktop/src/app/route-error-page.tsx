import { Button, EmptyState, Logo } from "@lifecycle/ui";
import type { ReactNode } from "react";
import { isRouteErrorResponse, useLocation, useRouteError } from "react-router-dom";

const MAX_ERROR_DETAIL_LENGTH = 240;
const HOME_HREF = "/";

interface RouteErrorSummary {
  detail?: string;
  description: string;
  eyebrow: string;
  title: string;
}

interface RouteErrorSurfaceProps {
  homeHref?: string;
  onReload?: () => void;
  pathLabel: string;
  summary: RouteErrorSummary;
}

function clampErrorDetail(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= MAX_ERROR_DETAIL_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_ERROR_DETAIL_LENGTH - 3)}...`;
}

function readErrorDetail(error: unknown): string | undefined {
  if (isRouteErrorResponse(error)) {
    const statusText = `${error.status} ${error.statusText}`.trim();
    const data =
      typeof error.data === "string"
        ? error.data
        : error.data instanceof Error
          ? error.data.message
          : undefined;
    const segments = [statusText, data].filter(
      (segment): segment is string => typeof segment === "string" && segment.length > 0,
    );
    return segments.length > 0 ? clampErrorDetail(segments.join(" ")) : undefined;
  }

  if (error instanceof Error) {
    return error.message.trim().length > 0 ? clampErrorDetail(error.message) : undefined;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return clampErrorDetail(error);
  }

  return undefined;
}

function isModuleImportFailure(error: unknown, detail: string | undefined): boolean {
  if (error instanceof Error && error.name === "ChunkLoadError") {
    return true;
  }

  const normalizedDetail = detail?.toLowerCase() ?? "";
  return (
    normalizedDetail.includes("importing a module script failed") ||
    normalizedDetail.includes("failed to fetch dynamically imported module") ||
    normalizedDetail.includes("error loading dynamically imported module") ||
    normalizedDetail.includes("loading chunk")
  );
}

export function summarizeRouteError(error: unknown): RouteErrorSummary {
  const detail = readErrorDetail(error);

  if (isModuleImportFailure(error, detail)) {
    return {
      detail,
      description:
        "Lifecycle could not load the current UI bundle for this surface. Reload the app to resync modules and reattach the workspace.",
      eyebrow: "Module sync lost",
      title: "Workspace surface failed to load",
    };
  }

  if (isRouteErrorResponse(error)) {
    return {
      detail,
      description:
        "Lifecycle rejected this route before the surface attached. Reload the app or return to the home surface.",
      eyebrow: `Route ${error.status}`,
      title: "Surface request failed",
    };
  }

  return {
    detail,
    description:
      "Lifecycle hit an unexpected fault while attaching this surface. Reload the app to recover, or return to the home surface.",
    eyebrow: "Route boundary",
    title: "Workspace surface failed to load",
  };
}

function ErrorHero() {
  return (
    <div className="relative flex h-32 w-32 items-center justify-center rounded-[32px] border border-[color-mix(in_srgb,var(--border),var(--foreground)_12%)] bg-[color-mix(in_srgb,var(--panel),var(--background)_26%)]">
      <div
        aria-hidden="true"
        className="lifecycle-motion-ready-ring absolute h-[5.5rem] w-[5.5rem] rounded-full border border-[color-mix(in_srgb,var(--foreground),transparent_78%)]"
      />
      <div
        aria-hidden="true"
        className="lifecycle-motion-soft-pulse absolute h-[4.5rem] w-[4.5rem] rounded-full bg-[color-mix(in_srgb,var(--foreground),transparent_92%)]"
      />
      <Logo
        animate
        className="relative z-10 text-[var(--foreground)]"
        drawDurationMs={2400}
        drawTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
        repeat
        size={76}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {label}
      </span>
      <div className="font-mono text-xs leading-5 text-[var(--foreground)]">{value}</div>
    </div>
  );
}

export function RouteErrorSurface({
  homeHref = HOME_HREF,
  onReload,
  pathLabel,
  summary,
}: RouteErrorSurfaceProps) {
  return (
    <div
      className="relative flex h-full w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)]"
      data-slot="route-error-surface"
      role="alert"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-[color-mix(in_srgb,var(--foreground),transparent_90%)]"
      />
      <div
        aria-hidden="true"
        className="absolute left-6 top-6 h-28 w-28 rounded-full border border-[color-mix(in_srgb,var(--border),var(--foreground)_10%)]"
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-6 sm:px-10 sm:py-10">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
            Lifecycle / workspace control plane
          </p>
          <p className="rounded-full border border-[color-mix(in_srgb,var(--border),var(--foreground)_12%)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            {summary.eyebrow}
          </p>
        </div>

        <div className="flex flex-1 items-center">
          <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16">
            <section className="flex max-w-3xl flex-col justify-center gap-6">
              <ErrorHero />

              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
                  {summary.title}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
                  {summary.description}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={onReload} size="lg">
                  Reload app
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a href={homeHref}>Return home</a>
                </Button>
              </div>
            </section>

            <aside className="flex flex-col justify-end gap-4">
              <EmptyState
                className="min-h-[220px] rounded-[28px] border border-[color-mix(in_srgb,var(--border),var(--foreground)_10%)] bg-[color-mix(in_srgb,var(--panel),var(--background)_18%)]"
                description="The failure is isolated to this surface. Workspace state and local settings stay intact until you choose the next move."
                icon={
                  <div className="rounded-[22px] border border-[color-mix(in_srgb,var(--border),var(--foreground)_10%)] bg-[var(--background)] p-3">
                    <Logo className="text-[var(--foreground)]" size={36} />
                  </div>
                }
                size="sm"
                title="Shell still stable"
              />

              <div className="rounded-[28px] border border-[color-mix(in_srgb,var(--border),var(--foreground)_10%)] bg-[color-mix(in_srgb,var(--panel),var(--background)_18%)] p-5">
                <div className="space-y-4" data-slot="route-error-detail">
                  <DetailRow label="Surface" value={pathLabel} />
                  <DetailRow
                    label="Failure"
                    value={summary.detail ?? "No structured error detail was provided."}
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  const location = useLocation();
  const pathLabel = `${location.pathname}${location.search}` || HOME_HREF;

  return (
    <RouteErrorSurface
      onReload={() => window.location.reload()}
      pathLabel={pathLabel}
      summary={summarizeRouteError(error)}
    />
  );
}
