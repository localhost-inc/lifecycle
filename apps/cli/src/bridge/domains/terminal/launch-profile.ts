import type { LifecycleSettings, LifecycleTerminalLaunchProfile } from "@lifecycle/contracts";
import type { WorkspaceShellLaunchSpec, WorkspaceTerminalKind } from "../workspace/host";

export interface ResolvedTerminalLaunch {
  kind: WorkspaceTerminalKind;
  launchSpec: WorkspaceShellLaunchSpec | null;
}

export function resolveTerminalLaunch(
  settings: LifecycleSettings,
  requestedKind?: WorkspaceTerminalKind,
): ResolvedTerminalLaunch {
  const profileId = resolveRequestedProfileId(settings, requestedKind);
  const profile = profileId ? settings.terminal.profiles[profileId] : null;

  return {
    kind: requestedKind ?? inferTerminalKind(profile) ?? "shell",
    launchSpec: profile ? buildTerminalLaunchSpec(profile) : null,
  };
}

function resolveRequestedProfileId(
  settings: LifecycleSettings,
  requestedKind?: WorkspaceTerminalKind,
): string | null {
  switch (requestedKind) {
    case "shell":
    case "claude":
    case "codex":
      return requestedKind;
    case "custom":
      return null;
    case undefined:
      return settings.terminal.defaultProfile;
  }
}

function inferTerminalKind(
  profile: LifecycleTerminalLaunchProfile | null | undefined,
): WorkspaceTerminalKind | null {
  if (!profile) {
    return null;
  }

  switch (profile.launcher) {
    case "shell":
      return "shell";
    case "claude":
      return "claude";
    case "codex":
      return "codex";
    case "command":
      return "custom";
  }
}

function buildTerminalLaunchSpec(
  profile: LifecycleTerminalLaunchProfile,
): WorkspaceShellLaunchSpec | null {
  switch (profile.launcher) {
    case "shell":
      return null;
    case "command":
      return {
        program: profile.command.program,
        args: [...profile.command.args],
        cwd: null,
        env: Object.entries(profile.command.env).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      };
    case "claude": {
      const args: string[] = [];
      if (profile.settings.model) {
        args.push("--model", profile.settings.model);
      }
      if (profile.settings.permissionMode) {
        args.push("--permission-mode", profile.settings.permissionMode);
      }
      if (profile.settings.effort) {
        args.push("--effort", profile.settings.effort);
      }
      return {
        program: "claude",
        args,
        cwd: null,
        env: [],
      };
    }
    case "codex": {
      const args: string[] = [];
      if (profile.settings.model) {
        args.push("--model", profile.settings.model);
      }
      if (profile.settings.configProfile) {
        args.push("--profile", profile.settings.configProfile);
      }
      if (profile.settings.approvalPolicy) {
        args.push("--ask-for-approval", profile.settings.approvalPolicy);
      }
      if (profile.settings.sandboxMode) {
        args.push("--sandbox", profile.settings.sandboxMode);
      }
      // The installed Codex CLI currently exposes search as a boolean flag rather than
      // the persisted disabled/cached/live tri-state. Any enabled search mode opts in.
      if (profile.settings.webSearch && profile.settings.webSearch !== "disabled") {
        args.push("--search");
      }
      return {
        program: "codex",
        args,
        cwd: null,
        env: [],
      };
    }
  }
}
