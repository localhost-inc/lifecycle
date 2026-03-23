export type ClaudeLoginMethod = "claudeai" | "console";

export function buildSessionEnv(loginMethod: ClaudeLoginMethod): Record<string, string | undefined> {
  const env = { ...process.env };

  if (loginMethod === "claudeai") {
    // Remove API key so the SDK defaults to OAuth subscription login.
    delete env.ANTHROPIC_API_KEY;
  }

  return env;
}
