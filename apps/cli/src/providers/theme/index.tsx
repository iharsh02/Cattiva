import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { readPreferences, savePreferences } from "@/lib/preferences";
import type { ThemeColors, Theme } from "@/theme";
import { DEFAULT_THEME, THEMES } from "@/theme";

function getInitialTheme(): Theme {
  const { themeName } = readPreferences();
  return THEMES.find((theme) => theme.name === themeName) ?? DEFAULT_THEME;
}

type ThemeContextValue = {
  colors: ThemeColors;
  currentTheme: Theme;
  /** Switch and remember. */
  setTheme: (theme: Theme) => void;
  previewTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return value;
}

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(getInitialTheme);

  const setTheme = useCallback((theme: Theme) => {
    setCurrentTheme(theme);
    savePreferences({ themeName: theme.name });
  }, []);

  const previewTheme = useCallback((theme: Theme) => setCurrentTheme(theme), []);

  const value = useMemo(
    () => ({ colors: currentTheme.colors, currentTheme, setTheme, previewTheme }),
    [currentTheme, setTheme, previewTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
