import { createRoute } from "routedjs";
import { z } from "zod";
import { readCredentials } from "../../src/domains/auth/credentials";
import { resolveGitProfile } from "../../src/domains/auth/git-profile";

const BridgeGitProfileSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().optional(),
    login: z.string().optional(),
    avatarUrl: z.string().optional(),
  })
  .meta({ id: "BridgeGitProfile" });

const BridgeAuthStateSchema = z
  .object({
    authenticated: z.boolean(),
    userId: z.string().optional(),
    email: z.string().optional(),
    displayName: z.string().optional(),
    activeOrgId: z.string().optional(),
    activeOrgSlug: z.string().optional(),
    gitProfile: BridgeGitProfileSchema.optional(),
  })
  .meta({ id: "BridgeAuthState" });

export default createRoute({
  schemas: {
    responses: {
      200: BridgeAuthStateSchema,
    },
  },
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
