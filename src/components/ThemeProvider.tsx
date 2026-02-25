"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { createClient } from "@/lib/supabase";

type Theme = "dark" | "light";
type DashboardMode = "ceo" | "company";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  dashboardMode: DashboardMode;
  setDashboardMode: (mode: DashboardMode) => void;
  loaded: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  dashboardMode: "ceo",
  setDashboardMode: () => {},
  loaded: false,
});

const THEME_KEY = "bp_theme";
const MODE_KEY = "bp_dashboard_mode";

function readLocalTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readLocalMode(): DashboardMode {
  if (typeof window === "undefined") return "ceo";
  const saved = localStorage.getItem(MODE_KEY);
  return saved === "company" ? "company" : "ceo";
}

export function ThemeProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(() => readLocalTheme());
  const [dashboardMode, setDashboardModeState] = useState<DashboardMode>(() => readLocalMode());
  const [loaded, setLoaded] = useState(false);
  const userIdRef = useRef<string | null>(userId ?? null);

  const persistRemote = useCallback(async (nextTheme: Theme, nextMode: DashboardMode) => {
    try {
      const supabase = createClient();
      let uid = userIdRef.current;
      if (!uid) {
        const { data } = await supabase.auth.getUser();
        uid = data.user?.id ?? null;
        userIdRef.current = uid;
      }
      if (!uid) return;
      await supabase.from("user_preferences").upsert(
        {
          user_id: uid,
          theme: nextTheme,
          dashboard_mode: nextMode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    } catch {
      // Offline / auth unavailable: keep local persistence only.
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(THEME_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MODE_KEY, dashboardMode);
    }
  }, [dashboardMode]);

  useEffect(() => {
    let alive = true;
    const syncFromRemote = async () => {
      try {
        const supabase = createClient();
        let uid = userIdRef.current;
        if (!uid) {
          const { data } = await supabase.auth.getUser();
          uid = data.user?.id ?? null;
          userIdRef.current = uid;
        }
        if (!uid) {
          if (alive) setLoaded(true);
          return;
        }

        const { data } = await supabase
          .from("user_preferences")
          .select("theme, dashboard_mode")
          .eq("user_id", uid)
          .maybeSingle();

        if (!alive) return;

        if (data?.theme === "light" || data?.theme === "dark") {
          setThemeState(data.theme);
        }
        if (data?.dashboard_mode === "ceo" || data?.dashboard_mode === "company") {
          setDashboardModeState(data.dashboard_mode);
        }

        if (!data) {
          await persistRemote(readLocalTheme(), readLocalMode());
        }
      } catch {
        // Keep local-only behavior on network/RLS errors.
      } finally {
        if (alive) setLoaded(true);
      }
    };

    syncFromRemote();
    return () => {
      alive = false;
    };
  }, [persistRemote]);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    void persistRemote(nextTheme, dashboardMode);
  }, [dashboardMode, persistRemote]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      void persistRemote(next, dashboardMode);
      return next;
    });
  }, [dashboardMode, persistRemote]);

  const setDashboardMode = useCallback((mode: DashboardMode) => {
    setDashboardModeState(mode);
    void persistRemote(theme, mode);
  }, [persistRemote, theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      dashboardMode,
      setDashboardMode,
      loaded,
    }),
    [theme, setTheme, toggleTheme, dashboardMode, setDashboardMode, loaded],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
