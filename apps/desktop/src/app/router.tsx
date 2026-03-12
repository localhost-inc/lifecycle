import { createBrowserRouter, Navigate } from "react-router-dom";
import { DashboardLayout } from "../components/layout/dashboard-layout";
import { DashboardIndexRoute } from "../features/dashboard/routes/dashboard-index-route";
import { OverlayHostRoute } from "../features/overlays/routes/overlay-host-route";
import { ProjectSettingsRoute } from "../features/projects/routes/project-settings-route";
import { SettingsShellLayout } from "../features/settings/layout/settings-shell-layout";
import { WorkspaceRoute } from "../features/workspaces/routes/workspace-route";

function createRouter() {
  return createBrowserRouter([
    {
      path: "/overlay-host",
      element: <OverlayHostRoute />,
    },
    {
      path: "/",
      element: <DashboardLayout />,
      children: [
        {
          index: true,
          element: <DashboardIndexRoute />,
        },
        {
          path: "workspaces/:workspaceId",
          element: <WorkspaceRoute />,
        },
        {
          path: "projects/:projectId/settings",
          element: <ProjectSettingsRoute />,
        },
        {
          path: "*",
          element: <Navigate to="/" replace />,
        },
      ],
    },
    {
      path: "/settings",
      element: <SettingsShellLayout />,
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
