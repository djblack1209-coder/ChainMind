"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  type ThemePreset,
  getAllPresets,
  getActivePresetId,
  applyPreset,
  clearPresetOverrides,
  builtinPresets,
} from "@/lib/theme-presets";

type ThemeMode = "dark" | "light" | "auto";
type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ResolvedTheme;
  activePresetId: string;
  setMode: (m: ThemeMode) => void;
  toggleTheme: () => void;
  setTheme: (t: ResolvedTheme) => void;
  applyThemePreset: (preset: ThemePreset) => void;
  presets: ThemePreset[];
  refreshPresets: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  theme: "dark",
  activePresetId: "default-dark",
  setMode: () => {},
  toggleTheme: () => {},
  setTheme: () => {},
  applyThemePreset: () => {},
  presets: builtinPresets,
  refreshPresets: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "auto" ? getSystemTheme() : mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [theme, setThemeState] = useState<ResolvedTheme>("dark");
  const [activePresetId, setActivePresetId] = useState("default-dark");
  const [presets, setPresets] = useState<ThemePreset[]>(builtinPresets);

  // Init from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("chainmind-theme") as ThemeMode | null;
    const m = stored === "light" || stored === "dark" || stored === "auto" ? stored : "dark";
    setModeState(m);
    const resolved = resolveTheme(m);
    setThemeState(resolved);
    document.documentElement.setAttribute("data-theme", resolved);

    // Restore active preset
    const allPresets = getAllPresets();
    setPresets(allPresets);
    const savedPresetId = getActivePresetId();
    const savedPreset = allPresets.find((p) => p.id === savedPresetId);
    if (savedPreset && savedPreset.id !== "default-dark" && savedPreset.id !== "default-light") {
      applyPreset(savedPreset);
      setActivePresetId(savedPreset.id);
    } else {
      setActivePresetId(resolved === "light" ? "default-light" : "default-dark");
    }
  }, []);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (mode !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      const resolved = getSystemTheme();
      setThemeState(resolved);
      document.documentElement.setAttribute("data-theme", resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    const resolved = resolveTheme(m);
    setThemeState(resolved);
    clearPresetOverrides();
    document.documentElement.setAttribute("data-theme", resolved);
    localStorage.setItem("chainmind-theme", m);
    setActivePresetId(resolved === "light" ? "default-light" : "default-dark");
    localStorage.setItem("chainmind-active-preset", resolved === "light" ? "default-light" : "default-dark");
  }, []);

  const setTheme = useCallback((t: ResolvedTheme) => {
    setMode(t);
  }, [setMode]);

  const toggleTheme = useCallback(() => {
    const next = mode === "dark" ? "light" : mode === "light" ? "auto" : "dark";
    setMode(next);
  }, [mode, setMode]);

  const applyThemePreset = useCallback((preset: ThemePreset) => {
    clearPresetOverrides();
    applyPreset(preset);
    setModeState(preset.base);
    setThemeState(preset.base);
    setActivePresetId(preset.id);
    localStorage.setItem("chainmind-theme", preset.base);
  }, []);

  const refreshPresets = useCallback(() => {
    setPresets(getAllPresets());
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        theme,
        activePresetId,
        setMode,
        toggleTheme,
        setTheme,
        applyThemePreset,
        presets,
        refreshPresets,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
