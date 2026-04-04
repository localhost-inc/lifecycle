const DEFAULT_CONTROL_PLANE_URL = "https://api.lifecycle.dev";
const DEFAULT_LOCAL_CONTROL_PLANE_URL = "http://127.0.0.1:8787";

export function resolveControlPlaneUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.LIFECYCLE_API_URL ??
    (env.LIFECYCLE_DEV === "1" ? DEFAULT_LOCAL_CONTROL_PLANE_URL : DEFAULT_CONTROL_PLANE_URL);
}
