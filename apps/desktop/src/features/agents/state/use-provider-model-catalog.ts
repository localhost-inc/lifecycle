import { useEffect, useState } from "react";
import type { ProviderModelCatalog } from "@lifecycle/agents";
import { Command } from "@tauri-apps/plugin-shell";
import type { ClaudeLoginMethod } from "@/features/settings/state/harnesses/claude";

export interface ProviderModelCatalogOptions {
  enabled?: boolean;
  loginMethod?: ClaudeLoginMethod;
  preferredModel?: string;
}

interface ProviderModelCatalogState {
  catalog: ProviderModelCatalog | null;
  error: Error | null;
  isLoading: boolean;
}

export async function fetchProviderModelCatalog(
  provider: "claude" | "codex",
  options: ProviderModelCatalogOptions,
): Promise<ProviderModelCatalog> {
  const args = ["agent", "catalog", "--provider", provider];
  if (provider === "claude" && options.loginMethod) {
    args.push("--login-method", options.loginMethod);
  }

  return await new Promise((resolve, reject) => {
    const command = Command.create("lifecycle", args);
    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };

    command.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    command.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    command.on("error", (message) => {
      settle(() => reject(new Error(message)));
    });
    command.on("close", ({ code, signal }) => {
      settle(() => {
        if (code !== 0) {
          reject(
            new Error(
              stderr.trim() ||
                `Catalog command exited unexpectedly (code=${code ?? "null"} signal=${signal ?? "null"}).`,
            ),
          );
          return;
        }

        try {
          resolve(JSON.parse(stdout) as ProviderModelCatalog);
        } catch (error) {
          reject(
            error instanceof Error ? error : new Error("Failed to parse provider model catalog."),
          );
        }
      });
    });

    void command.spawn().catch((error) => {
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    });
  });
}

export function useProviderModelCatalog(
  provider: "claude" | "codex",
  options: ProviderModelCatalogOptions,
): ProviderModelCatalogState {
  const requestKey = `${provider}:${options.loginMethod ?? ""}:${options.preferredModel ?? ""}`;
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<ProviderModelCatalogState>({
    catalog: null,
    error: null,
    isLoading: enabled,
  });

  useEffect(() => {
    if (!enabled) {
      setState((current) => ({
        catalog: current.catalog,
        error: null,
        isLoading: false,
      }));
      return;
    }

    let active = true;

    setState((current) => ({
      catalog: current.catalog,
      error: null,
      isLoading: true,
    }));

    void fetchProviderModelCatalog(provider, options)
      .then((catalog) => {
        if (!active) {
          return;
        }
        setState({
          catalog,
          error: null,
          isLoading: false,
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setState((current) => ({
          catalog: current.catalog,
          error: error instanceof Error ? error : new Error(String(error)),
          isLoading: false,
        }));
      });

    return () => {
      active = false;
    };
  }, [enabled, provider, requestKey]);

  return state;
}
