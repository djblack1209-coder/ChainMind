"use client";

import React from "react";

interface AdminPageIntroProps {
  title: string;
  description: string;
  chips?: string[];
  actions?: React.ReactNode;
}

export default function AdminPageIntro({ title, description, chips = [], actions }: AdminPageIntroProps) {
  return (
    <div className="panel-shell rounded-[30px] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="section-kicker">Admin module</div>
          <h2 className="mt-4 text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">{title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">{description}</p>
          {chips.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {chips.map((chip, index) => (
                <span key={`${chip}-${index}`} className={index % 3 === 0 ? "chip chip-warm" : index % 3 === 1 ? "chip chip-cool" : "chip chip-muted"}>
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
