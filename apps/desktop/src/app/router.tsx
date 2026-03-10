import { createBrowserRouter, Navigate } from "react-router-dom";
import { DashboardLayout } from "../components/layout/dashboard-layout";
import { DashboardIndexRoute } from "../features/dashboard/routes/dashboard-index-route";
import { OverlayHostRoute } from "../features/overlays/routes/overlay-host-route";
import { ProjectSettingsRoute } from "../features/projects/routes/project-settings-route";
import { SettingsShellLayout } from "../features/settings/layout/settings-shell-layout";
import { WorkspaceRoute } from "../features/workspaces/routes/workspace-route";

export const router = createBrowserRouter([
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
