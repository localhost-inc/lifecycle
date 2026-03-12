import { Suspense, lazy, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { Loading } from "@lifecycle/ui";
import { DashboardLayout } from "../components/layout/dashboard-layout";

const DashboardIndexRoute = lazy(async () => {
  const module = await import("../features/dashboard/routes/dashboard-index-route");
  return {
    default: module.DashboardIndexRoute,
  };
});
const OverlayHostRoute = lazy(async () => {
  const module = await import("../features/overlays/routes/overlay-host-route");
  return {
    default: module.OverlayHostRoute,
  };
});
const ProjectSettingsRoute = lazy(async () => {
  const module = await import("../features/projects/routes/project-settings-route");
  return {
    default: module.ProjectSettingsRoute,
  };
});
const SettingsShellLayout = lazy(async () => {
  const module = await import("../features/settings/layout/settings-shell-layout");
  return {
    default: module.SettingsShellLayout,
  };
});
const WorkspaceRoute = lazy(async () => {
  const module = await import("../features/workspaces/routes/workspace-route");
  return {
    default: module.WorkspaceRoute,
  };
});

function RouteFallback() {
  return <Loading />;
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function createRouter() {
  return createBrowserRouter([
    {
      path: "/overlay-host",
      element: (
        <LazyRoute>
          <OverlayHostRoute />
        </LazyRoute>
      ),
    },
    {
      path: "/",
      element: <DashboardLayout />,
      children: [
        {
          index: true,
          element: (
            <LazyRoute>
              <DashboardIndexRoute />
            </LazyRoute>
          ),
        },
        {
          path: "workspaces/:workspaceId",
          element: (
            <LazyRoute>
              <WorkspaceRoute />
            </LazyRoute>
          ),
        },
        {
          path: "projects/:projectId/settings",
          element: (
            <LazyRoute>
              <ProjectSettingsRoute />
            </LazyRoute>
          ),
        },
        {
          path: "*",
          element: <Navigate to="/" replace />,
        },
      ],
    },
    {
      path: "/settings",
      element: (
        <LazyRoute>
          <SettingsShellLayout />
        </LazyRoute>
      ),
    },
    {
      path: "/settings/*",
      element: <Navigate to="/settings" replace />,
    },
  ]);
}

// Preserve router instance across HMR updates
let router: ReturnType<typeof createBrowserRouter>;
if (import.meta.hot?.data.router) {
  router = import.meta.hot.data.router;
} else {
  router = createRouter();
}
if (import.meta.hot) {
  import.meta.hot.data.router = router;
}

export { router };
