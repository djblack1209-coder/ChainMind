"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/workspace");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-root)]">
      <div className="glass flex items-center gap-3 rounded-full px-5 py-3 text-sm text-[var(--text-secondary)]">
        <div className="h-4 w-4 rounded-full border-2 border-[var(--brand-primary)] border-t-transparent animate-spin" />
        正在启动 AI Chain IDE
      </div>
    </div>
  );
}
