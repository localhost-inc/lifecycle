import { createBrowserRouter, Navigate } from "react-router-dom";
import { DashboardLayout } from "../components/layout/dashboard-layout";
import { RootShellLayout } from "../components/layout/root-shell-layout";
import { DashboardIndexRoute } from "../features/dashboard/routes/dashboard-index-route";
import { ProjectSettingsRoute } from "../features/projects/routes/project-settings-route";
import { SettingsShellLayout } from "../features/settings/layout/settings-shell-layout";
import { SettingsGeneralRoute } from "../features/settings/routes/settings-general-route";
import { SettingsPersonalizationRoute } from "../features/settings/routes/settings-personalization-route";
import { SettingsSectionPlaceholderRoute } from "../features/settings/routes/settings-section-placeholder-route";
import { SettingsWorktreesRoute } from "../features/settings/routes/settings-worktrees-route";
import { WorkspaceRoute } from "../features/workspaces/routes/workspace-route";

export const router = createBrowserRouter([
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
    element: <RootShellLayout />,
    children: [
      {
        element: <SettingsShellLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="general" replace />,
          },
          {
            path: "general",
            element: <SettingsGeneralRoute />,
          },
          {
            path: "configuration",
            element: (
              <SettingsSectionPlaceholderRoute
                title="Configuration"
                description="Configuration settings are coming soon."
              />
            ),
          },
          {
            path: "personalization",
            element: <SettingsPersonalizationRoute />,
          },
          {
            path: "mcp-servers",
            element: (
              <SettingsSectionPlaceholderRoute
                title="MCP servers"
                description="MCP server settings are coming soon."
              />
            ),
          },
          {
            path: "git",
            element: (
              <SettingsSectionPlaceholderRoute
                title="Git"
                description="Git settings are coming soon."
              />
            ),
          },
          {
            path: "environments",
            element: (
              <SettingsSectionPlaceholderRoute
                title="Environments"
                description="Environment settings are coming soon."
              />
            ),
          },
          {
            path: "worktrees",
            element: <SettingsWorktreesRoute />,
          },
          {
            path: "archived-threads",
            element: (
              <SettingsSectionPlaceholderRoute
                title="Archived threads"
                description="Archived threads are coming soon."
              />
            ),
          },
          {
            path: "*",
            element: <Navigate to="/settings/general" replace />,
          },
        ],
      },
    ],
  },
]);
