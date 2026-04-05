/**
 * GitHub App authentication helpers.
 *
 * Mints short-lived installation access tokens using the App's private key.
 * These tokens are used to clone private repos into sandbox containers.
 */

/** Base64url encode (no padding). */
function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Import a PKCS#8 PEM private key as a CryptoKey for RS256 signing. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const stripped = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const binary = Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Create a GitHub App JWT valid for 10 minutes. */
async function createAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(
    new TextEncoder().encode(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })),
  );

  const key = await importPrivateKey(privateKeyPem);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  );

  return `${header}.${payload}.${base64url(signature)}`;
}

/**
 * Get a short-lived installation access token from GitHub.
 *
 * The token can be used in HTTPS clone URLs:
 *   https://x-access-token:{token}@github.com/{owner}/{repo}.git
 */
export async function getInstallationToken(
  appId: string,
  privateKeyPem: string,
  installationId: string,
): Promise<string> {
  const jwt = await createAppJwt(appId, privateKeyPem);

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "User-Agent": "lifecycle-api",
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub installation token request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}

/**
 * Look up the GitHub App installation for a specific repo.
 *
 * Returns the installation ID if the app is installed with access to the repo,
 * or null if not installed.
 */
export async function getRepoInstallation(
  appId: string,
  privateKeyPem: string,
  owner: string,
  repo: string,
): Promise<{ installationId: string; permissions: Record<string, string> } | null> {
  const jwt = await createAppJwt(appId, privateKeyPem);

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/installation`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "User-Agent": "lifecycle-api",
    },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub installation lookup failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    id: number;
    permissions: Record<string, string>;
  };

  return {
    installationId: String(data.id),
    permissions: data.permissions,
  };
}

/**
 * Get the public install URL for the GitHub App.
 */
export function appInstallUrl(appSlug: string): string {
  return `https://github.com/apps/${appSlug}/installations/new`;
}

/** Build an authenticated HTTPS clone URL. */
export function cloneUrl(owner: string, repo: string, token: string): string {
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

/** Create a pull request via the GitHub API. */
export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  params: { title: string; body?: string; head: string; base: string },
): Promise<{ number: number; url: string; state: string }> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "lifecycle-api",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PR creation failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { number: number; html_url: string; state: string };
  return { number: data.number, url: data.html_url, state: data.state };
}

/** Merge a pull request via the GitHub API. */
export async function mergePullRequest(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<{ merged: boolean; message: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "lifecycle-api",
      },
      body: JSON.stringify({ merge_method: "squash" }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PR merge failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { merged: boolean; message: string };
  return data;
}
