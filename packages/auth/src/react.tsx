import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { buildLoggedOutAuthSession, type AuthClient, type AuthSession } from "./index";

export interface AuthSessionContextValue {
  isLoading: boolean;
  refresh: () => Promise<void>;
  session: AuthSession;
}

export interface AuthSessionProviderProps extends PropsWithChildren {
  client: AuthClient;
  getErrorMessage?: (error: unknown, fallback: string) => string;
  refreshIntervalMs?: number;
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

function defaultGetErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({
  children,
  client,
  getErrorMessage = defaultGetErrorMessage,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: AuthSessionProviderProps) {
  const [session, setSession] = useState<AuthSession>(() => buildLoggedOutAuthSession());
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (showLoading = false) => {
      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;

      if (showLoading) {
        setIsLoading(true);
      }

      try {
        const nextSession = await client.readSession();
        if (!mountedRef.current || requestVersionRef.current !== requestVersion) {
          return;
        }

        setSession(nextSession);
      } catch (error) {
        if (!mountedRef.current || requestVersionRef.current !== requestVersion) {
          return;
        }

        setSession(
          buildLoggedOutAuthSession({
            message: getErrorMessage(error, "Failed to resolve auth status."),
          }),
        );
      } finally {
        if (mountedRef.current && requestVersionRef.current === requestVersion) {
          setIsLoading(false);
        }
      }
    },
    [client, getErrorMessage],
  );

  useEffect(() => {
    void refresh(true);

    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const handleFocus = () => {
      void refresh(false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh(false);
      }
    };
    const refreshInterval = window.setInterval(() => {
      void refresh(false);
    }, refreshIntervalMs);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh, refreshIntervalMs]);

  const contextValue = useMemo<AuthSessionContextValue>(
    () => ({
      isLoading,
      refresh: () => refresh(true),
      session,
    }),
    [isLoading, refresh, session],
  );

  return <AuthSessionContext.Provider value={contextValue}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }
  return context;
}
