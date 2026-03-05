import { createBrowserRouter, Navigate } from "react-router-dom";
import { ROUTE_IDS } from "./route-types";
import { DashboardLayout, dashboardLoader } from "../components/layout/dashboard-layout";
import { DashboardIndexRoute } from "../features/dashboard/routes/dashboard-index-route";
import { ProjectSettingsRoute } from "../features/projects/routes/project-settings-route";
import {
  WorkspaceRoute,
  WorkspaceRouteError,
  workspaceRouteLoader,
} from "../features/workspaces/routes/workspace-route";

export const router = createBrowserRouter([
  {
    id: ROUTE_IDS.root,
    path: "/",
    loader: dashboardLoader,
    element: <DashboardLayout />,
    children: [
      {
        index: true,
        element: <DashboardIndexRoute />,
      },
      {
        id: ROUTE_IDS.workspace,
        path: "workspaces/:workspaceId",
        loader: workspaceRouteLoader,
        element: <WorkspaceRoute />,
        errorElement: <WorkspaceRouteError />,
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
]);
