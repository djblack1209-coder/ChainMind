"use client";

// AuthGuard: wraps protected pages, redirects to /login if not authenticated
// In non-Electron (browser) mode, skips auth check entirely

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { isLoggedIn, loading, restoreSession } = useAuthStore();
  const [checked, setChecked] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    const electron = typeof window !== "undefined" && !!window.electronAPI;
    setIsElectron(electron);

    if (!electron) {
      // Browser mode: no auth required
      setChecked(true);
      return;
    }

    // Electron mode: verify session
    restoreSession().then((valid) => {
      if (!valid) {
        router.replace("/login");
      }
      setChecked(true);
    });
  }, [restoreSession, router]);

  if (!checked || loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-root)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Browser mode: always allow
  if (!isElectron) {
    return <>{children}</>;
  }

  // Electron mode: must be logged in
  if (!isLoggedIn) {
    return null;
  }

  return <>{children}</>;
}
