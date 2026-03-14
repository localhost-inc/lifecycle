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
import { getLifecycleErrorMessage } from "../../../lib/tauri-error";
import { readCurrentAuthSession } from "../api/auth-session";
import { buildLoggedOutAuthSession, type AuthSession } from "../auth-session";

interface AuthSessionContextValue {
  isLoading: boolean;
  refresh: () => Promise<void>;
  session: AuthSession;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: PropsWithChildren) {
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

  const refresh = useCallback(async (showLoading = false) => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;

    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const nextSession = await readCurrentAuthSession();
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
          message: getLifecycleErrorMessage(error, "Failed to resolve auth status."),
        }),
      );
    } finally {
      if (mountedRef.current && requestVersionRef.current === requestVersion) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh(true);

    const handleFocus = () => {
      void refresh(false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh(false);
      }
    };
    const refreshInterval = window.setInterval(
      () => {
        void refresh(false);
      },
      import.meta.env.DEV ? 5_000 : 60_000,
    );

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

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
