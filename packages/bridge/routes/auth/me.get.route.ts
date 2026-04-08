import { createRoute } from "routedjs";
import { readCredentials } from "../../src/credentials";
import { resolveGitProfile } from "../../src/git-profile";

export default createRoute({
  handler: async () => {
    const credentials = readCredentials();

    if (credentials) {
      return {
        authenticated: true as const,
        userId: credentials.userId,
        email: credentials.email,
        displayName: credentials.displayName,
        activeOrgId: credentials.activeOrgId,
        activeOrgSlug: credentials.activeOrgSlug,
      };
    }

    // Not signed in — try to derive a profile from git/GitHub.
    const gitProfile = await resolveGitProfile();

    return {
      authenticated: false as const,
      gitProfile,
    };
  },
});
