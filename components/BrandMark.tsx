"use client";

import React, { useId } from "react";

type BrandSize = "sm" | "md" | "lg";

interface BrandMarkProps {
  size?: BrandSize;
  showWordmark?: boolean;
  subtitle?: string;
  className?: string;
}

const SIZE_MAP: Record<BrandSize, { shell: string; svg: string; gap: string; title: string; subtitle: string }> = {
  sm: {
    shell: "h-10 w-10 rounded-[14px]",
    svg: "h-6 w-6",
    gap: "gap-2.5",
    title: "text-lg",
    subtitle: "text-[10px]",
  },
  md: {
    shell: "h-11 w-11 rounded-[15px]",
    svg: "h-7 w-7",
    gap: "gap-3",
    title: "text-xl",
    subtitle: "text-[10px]",
  },
  lg: {
    shell: "h-14 w-14 rounded-[18px]",
    svg: "h-9 w-9",
    gap: "gap-3.5",
    title: "text-3xl",
    subtitle: "text-xs",
  },
};

export default function BrandMark({
  size = "md",
  showWordmark = false,
  subtitle,
  className = "",
}: BrandMarkProps) {
  const s = SIZE_MAP[size];
  const gid = useId().replace(/:/g, "");

  return (
    <div className={`flex items-center ${s.gap} ${className}`.trim()}>
      <div className={`brand-mark-shell-v2 relative flex items-center justify-center ${s.shell}`}>
        <svg viewBox="0 0 64 64" className={s.svg} fill="none" aria-hidden="true">
          <defs>
            <linearGradient id={`cm-acc-${gid}`} x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#00d2ff" />
              <stop offset="50%" stopColor="#7b68ee" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <linearGradient id={`cm-s2-${gid}`} x1="18" y1="11" x2="46" y2="53" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {/* Chain link left arc — "C" */}
          <path d="M 27.5 20 C 18.75 20, 13.75 26.25, 13.75 32 C 13.75 37.75, 18.75 44, 27.5 44" stroke={`url(#cm-acc-${gid})`} strokeWidth="3.25" strokeLinecap="round" fill="none" />
          {/* Chain link right arc — mirrored */}
          <path d="M 36.5 20 C 45.25 20, 50.25 26.25, 50.25 32 C 50.25 37.75, 45.25 44, 36.5 44" stroke={`url(#cm-acc-${gid})`} strokeWidth="3.25" strokeLinecap="round" fill="none" />
          {/* Bridge bars */}
          <line x1="27.5" y1="20" x2="36.5" y2="20" stroke={`url(#cm-acc-${gid})`} strokeWidth="3.25" strokeLinecap="round" />
          <line x1="27.5" y1="44" x2="36.5" y2="44" stroke={`url(#cm-acc-${gid})`} strokeWidth="3.25" strokeLinecap="round" />

          {/* Neural lines from center */}
          <line x1="32" y1="30.4" x2="32" y2="21.6" stroke={`url(#cm-s2-${gid})`} strokeWidth="0.5" strokeLinecap="round" />
          <line x1="32" y1="33.6" x2="32" y2="42.4" stroke={`url(#cm-s2-${gid})`} strokeWidth="0.5" strokeLinecap="round" />
          <line x1="30.4" y1="32" x2="21.6" y2="32" stroke={`url(#cm-s2-${gid})`} strokeWidth="0.5" strokeLinecap="round" />
          <line x1="33.6" y1="32" x2="42.4" y2="32" stroke={`url(#cm-s2-${gid})`} strokeWidth="0.5" strokeLinecap="round" />

          {/* Center mind core */}
          <circle cx="32" cy="32" r="2.6" fill="#00d2ff" opacity="0.15" />
          <circle cx="32" cy="32" r="1.6" fill="#00d2ff" opacity="0.9" />
          <circle cx="32" cy="32" r="0.75" fill="#ffffff" />

          {/* Endpoint dots */}
          <circle cx="32" cy="21.6" r="0.6" fill="#00d2ff" opacity="0.7" />
          <circle cx="32" cy="42.4" r="0.6" fill="#a855f7" opacity="0.7" />
          <circle cx="21.6" cy="32" r="0.6" fill="#00d2ff" opacity="0.7" />
          <circle cx="42.4" cy="32" r="0.6" fill="#a855f7" opacity="0.7" />
        </svg>
      </div>

      {showWordmark && (
        <div>
          <div className={`font-display leading-none text-[var(--text-primary)] ${s.title}`}>
            AI Chain<span className="ml-1 text-[var(--text-tertiary)] font-normal text-[0.6em]">IDE</span>
          </div>
          {subtitle && (
            <div className={`mt-0.5 text-[var(--text-tertiary)] ${s.subtitle}`}>{subtitle}</div>
          )}
        </div>
      )}
    </div>
  );
}
