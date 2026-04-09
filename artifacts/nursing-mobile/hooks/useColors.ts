import { useColorScheme } from "react-native";

import colors from "@/constants/colors";
import { useApp } from "@/contexts/AppContext";

/**
 * Returns the design tokens for the current color scheme.
 *
 * Priority:
 *  1. Manual override from AppContext.themeMode ('light' | 'dark')
 *  2. Device system setting ('auto' → useColorScheme())
 *
 * Falls back to dark if system scheme is unknown.
 */
export function useColors() {
  const systemScheme = useColorScheme();
  const { themeMode } = useApp();

  const effectiveScheme =
    themeMode === "auto" ? (systemScheme ?? "dark") : themeMode;

  const palette = effectiveScheme === "light" ? colors.light : colors.dark;

  return { ...palette, radius: colors.radius, isDark: effectiveScheme === "dark" };
}
