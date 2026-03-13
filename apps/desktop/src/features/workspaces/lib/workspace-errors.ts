import { toErrorEnvelope } from "../../../lib/tauri-error";

export function formatWorkspaceError(error: unknown, fallback: string): string {
  const envelope = toErrorEnvelope(error);

  switch (envelope.code) {
    case "workspace_mutation_locked":
      return (
        envelope.suggestedAction ?? "Workspace is busy. Try again once the current action finishes."
      );
    case "invalid_state_transition":
      return "That action is not allowed in the current workspace state.";
    case "local_docker_unavailable":
      return "Docker is not available on this machine.";
    case "local_port_conflict":
      return "A required local port is already in use.";
    case "not_found":
      return "Workspace not found.";
    case "setup_step_failed":
      return "A setup step failed. Check the environment logs for details.";
    case "service_start_failed":
      return "A service failed to start. Check the environment logs for details.";
    case "service_healthcheck_failed":
      return "A service failed its health check. Check the environment logs for details.";
    default:
      return envelope.message.trim().length > 0 ? envelope.message : fallback;
  }
}
