import { Suspense, lazy, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { Loading } from "@lifecycle/ui";
import { AppShellLayout } from "@/components/layout/app-shell-layout";
import { RouteErrorPage } from "@/app/route-error-page";
const HomeRoute = lazy(async () => {
  const module = await import("../features/projects/routes/home-route");
  return {
    default: module.HomeRoute,
  };
});
const ProjectSettingsRoute = lazy(async () => {
  const module = await import("../features/projects/routes/project-settings-route");
  return {
    default: module.ProjectSettingsRoute,
  };
});
const ProjectRoute = lazy(async () => {
  const module = await import("../features/projects/routes/project-route");
  return {
    default: module.ProjectRoute,
  };
});
const ProjectIndexRedirect = lazy(async () => {
  const module = await import("../features/projects/routes/project-index-redirect");
  return {
    default: module.ProjectIndexRedirect,
  };
});
const WorkspaceRoute = lazy(async () => {
  const module = await import("../features/workspaces/routes/workspace-route");
  return {
    default: module.WorkspaceRoute,
  };
});
const SettingsShellLayout = lazy(async () => {
  const module = await import("../features/settings/layout/settings-shell-layout");
  return {
    default: module.SettingsShellLayout,
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
      errorElement: <RouteErrorPage />,
      children: [
        {
          path: "/",
          element: <AppShellLayout />,
          children: [
            {
              index: true,
              element: (
                <LazyRoute>
                  <HomeRoute />
                </LazyRoute>
              ),
            },
            {
              path: "projects/:projectId",
              element: (
                <LazyRoute>
                  <ProjectRoute />
                </LazyRoute>
              ),
              children: [
                {
                  index: true,
                  element: (
                    <LazyRoute>
                      <ProjectIndexRedirect />
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
                  path: "settings",
                  element: (
                    <LazyRoute>
                      <ProjectSettingsRoute />
                    </LazyRoute>
                  ),
                },
              ],
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
      ],
    },
  ]);
}
// Preserve the router instance across HMR to prevent full-tree remounts.
// Without this, any change to a file imported by a route component causes
// router.tsx to re-execute, creating a new router and unmounting everything.
let router: ReturnType<typeof createBrowserRouter>;
if (import.meta.hot?.data?.router) {
  router = import.meta.hot.data.router as typeof router;
} else {
  router = createRouter();
}
if (import.meta.hot) {
  import.meta.hot.data.router = router;
}
export { router };
