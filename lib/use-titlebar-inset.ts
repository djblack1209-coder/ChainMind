"use client";

import { useEffect, useState } from "react";

const MAC_TITLEBAR_INSET = 34;

function getInitialInset() {
  if (typeof navigator === "undefined") {
    return 0;
  }

  const isElectron = navigator.userAgent.includes("Electron");
  const isMac = navigator.platform.toLowerCase().includes("mac");
  return isElectron && isMac ? MAC_TITLEBAR_INSET : 0;
}

export function useTitlebarInset() {
  const [titlebarInset, setTitlebarInset] = useState(getInitialInset);

  useEffect(() => {
    let cancelled = false;

    const resolveInset = async () => {
      if (typeof window === "undefined" || !window.electronAPI?.getPlatform) {
        return;
      }

      try {
        const platform = await window.electronAPI.getPlatform();
        if (!cancelled && platform === "darwin") {
          setTitlebarInset(MAC_TITLEBAR_INSET);
        }
      } catch {
        // Fallback to zero inset when platform detection fails.
      }
    };

    resolveInset();

    return () => {
      cancelled = true;
    };
  }, []);

  return titlebarInset;
}
