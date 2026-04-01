import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createClient } from "../../rpc-client";
import { readCredentials, writeCredentials } from "../../credentials";
import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Sign in to Lifecycle with GitHub.",
  input: z.object({
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      // Check if already logged in
      const existing = await readCredentials();
      if (existing) {
        if (input.json) {
          context.stdout(
            JSON.stringify({
              alreadyLoggedIn: true,
              email: existing.email,
              displayName: existing.displayName,
              activeOrgId: existing.activeOrgId,
              activeOrgSlug: existing.activeOrgSlug,
            }),
          );
          return 0;
        }

        context.stdout(`Already signed in as ${existing.displayName} (${existing.email}).`);
        context.stdout(
          existing.activeOrgSlug
            ? `Active organization: ${existing.activeOrgSlug}`
            : "No active organization.",
        );
        return 0;
      }

      // Start device auth flow (unauthenticated)
      const client = createClient({ requireAuth: false });

      const deviceCodeRes = await client.auth["device-code"].$post();
      const deviceCode = await deviceCodeRes.json();

      if (!input.json) {
        context.stdout("Open this URL to sign in:");
        context.stdout("");
        context.stdout(`  ${deviceCode.verificationUriComplete}`);
        context.stdout("");
        context.stdout(`Your code: ${deviceCode.userCode}`);
        context.stdout("");
        context.stdout("Waiting for authentication...");
      }

      // Poll for completion
      const interval = (deviceCode.interval ?? 5) * 1000;
      const deadline = Date.now() + deviceCode.expiresIn * 1000;

      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, interval));

        const tokenRes = await client.auth.token.$post({
          json: { deviceCode: deviceCode.deviceCode },
        });
        const tokenResult = await tokenRes.json();

        if ("pending" in tokenResult && tokenResult.pending) {
          continue;
        }

        if ("token" in tokenResult) {
          // Success — store credentials
          await writeCredentials({
            token: tokenResult.token,
            userId: tokenResult.userId,
            email: tokenResult.email,
            displayName: tokenResult.displayName,
            activeOrgId: tokenResult.defaultOrgId,
            activeOrgSlug: tokenResult.defaultOrgSlug,
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken,
          });

          if (input.json) {
            context.stdout(
              JSON.stringify({
                loggedIn: true,
                email: tokenResult.email,
                displayName: tokenResult.displayName,
                activeOrgId: tokenResult.defaultOrgId,
                activeOrgSlug: tokenResult.defaultOrgSlug,
              }),
            );
            return 0;
          }

          context.stdout(`Signed in as ${tokenResult.displayName} (${tokenResult.email}).`);
          if (tokenResult.defaultOrgSlug) {
            context.stdout(`Active organization: ${tokenResult.defaultOrgSlug}`);
          }
          return 0;
        }
      }

      // Expired
      context.stderr("Authentication timed out. Run `lifecycle auth login` to try again.");
      return 1;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
