import { Component, type ErrorInfo, type ReactNode } from "react";
import { RouteErrorSurface, summarizeRouteError } from "@/app/route-error-page";

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  error: unknown | null;
}

interface RootErrorSummary {
  detail?: string;
  description: string;
  eyebrow: string;
  title: string;
}

function readCurrentPathLabel(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}` || "/";
}

export function summarizeRootError(error: unknown): RootErrorSummary {
  const routeSummary = summarizeRouteError(error);

  return {
    detail: routeSummary.detail,
    description:
      "Lifecycle hit an unexpected fault while rendering the desktop shell. Reload the app to recover, or return to the home surface.",
    eyebrow: "App boundary",
    title: "Desktop shell failed to render",
  };
}

export function RootErrorFallback({ error }: { error: unknown }) {
  return (
    <RouteErrorSurface
      homeHref="/"
      onReload={() => window.location.reload()}
      pathLabel={readCurrentPathLabel()}
      summary={summarizeRootError(error)}
    />
  );
}

export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error("Desktop shell render failed:", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.error !== null) {
      return <RootErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}
