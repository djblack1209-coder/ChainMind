"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

import { useAuthStore } from "@/stores/auth-store";
import { ToastProvider } from "@/components/Toast";
import { useTitlebarInset } from "@/lib/use-titlebar-inset";
import BrandMark from "@/components/BrandMark";

interface MenuItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  children?: MenuItem[];
}

const ICON_SIZE = "w-4 h-4";

const Icons = {
  cog: (
    <svg className={ICON_SIZE} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  user: (
    <svg className={ICON_SIZE} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  back: (
    <svg className={ICON_SIZE} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  ),
  dashboard: (
    <svg className={ICON_SIZE} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  logout: (
    <svg className={ICON_SIZE} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  ),
};

const menuConfig: { group: string; items: MenuItem[] }[] = [
  {
    group: "概览",
    items: [
      { label: "概览", path: "/admin", icon: Icons.dashboard },
    ],
  },
  {
    group: "设置",
    items: [
      { label: "系统配置", path: "/admin/config", icon: Icons.cog },
      { label: "个人信息", path: "/admin/profile", icon: Icons.user },
    ],
  },
];

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const titlebarInset = useTitlebarInset();
  const [collapsed, setCollapsed] = useState(false);

  const currentLabel = menuConfig
    .flatMap((g) => g.items)
    .find((item) => pathname === item.path)?.label || "管理后台";

  const handleLogout = () => {
    logout();
    router.replace("/workspace");
  };

  return (
    <div
      className="min-h-screen bg-[var(--bg-root)]"
      style={titlebarInset > 0 ? { paddingTop: `${titlebarInset}px` } : undefined}
    >
      <div className="flex min-h-screen gap-3 p-3">
        <aside className={`panel-shell flex flex-shrink-0 flex-col overflow-hidden rounded-[30px] transition-all duration-300 ${collapsed ? "w-20" : "w-[296px]"}`}>
          <div className={`flex h-20 items-center border-b border-white/8 ${collapsed ? "justify-center px-0" : "justify-between px-4"}`}>
            {!collapsed && (
              <BrandMark size="md" showWordmark subtitle="admin console" />
            )}

            <button onClick={() => setCollapsed(!collapsed)} className="btn btn-ghost btn-icon border border-white/8 bg-white/[0.03]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {collapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                )}
              </svg>
            </button>
          </div>

          {!collapsed && (
            <div className="px-4 pt-4">
              <div className="panel-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="meta-label">Current operator</div>
                    <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{user?.nick_name || user?.username || "管理员"}</div>
                    <div className="mt-1 text-xs text-[var(--text-tertiary)]">Admin workspace</div>
                  </div>
                  <span className="chip chip-cool">secure</span>
                </div>
              </div>
            </div>
          )}

          <nav className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-5">
              {menuConfig.map((group) => (
                <div key={group.group}>
                  {!collapsed && <div className="meta-label mb-3 px-1">{group.group}</div>}
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const active = pathname === item.path;
                      return (
                        <button
                          key={item.path}
                          onClick={() => router.push(item.path)}
                          title={collapsed ? item.label : undefined}
                          className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                            active
                              ? "border-[var(--border-primary)] bg-[var(--brand-primary-soft)] text-[#ffc4b1]"
                              : "border-transparent text-[var(--text-secondary)] hover:border-white/8 hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border ${active ? 'border-[var(--border-primary)] bg-[rgba(255,115,77,0.08)]' : 'border-white/8 bg-white/[0.03]'}`}>
                            {item.icon}
                          </span>
                          {!collapsed && (
                            <span className="truncate text-sm font-medium">{item.label}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          <div className="border-t border-white/8 p-4 space-y-2">
            <button
              onClick={() => router.push("/workspace")}
              title="返回工作台"
              className={`btn btn-secondary w-full ${collapsed ? 'px-0' : 'justify-between px-4'}`}
            >
              <span className="flex items-center gap-2">
                {Icons.back}
                {!collapsed && <span>返回工作台</span>}
              </span>
              {!collapsed && <span className="text-[11px] text-[var(--text-tertiary)]">workspace</span>}
            </button>
            <button
              onClick={handleLogout}
              title="退出登录"
              className={`btn btn-danger w-full ${collapsed ? 'px-0' : 'justify-between px-4'}`}
            >
              <span className="flex items-center gap-2">
                {Icons.logout}
                {!collapsed && <span>退出登录</span>}
              </span>
              {!collapsed && <span className="text-[11px] opacity-70">logout</span>}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,18,27,0.88),rgba(8,11,18,0.96))] shadow-[var(--shadow-md)]">
          <header className="flex h-20 items-center justify-between border-b border-white/8 px-6">
            <div>
              <div className="section-kicker">Admin workspace</div>
              <h1 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">{currentLabel}</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="chip chip-muted hidden md:inline-flex">System control</span>
              {user && <span className="text-sm text-[var(--text-tertiary)]">{user.nick_name || user.username}</span>}
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-sm font-semibold text-[var(--text-primary)]">
                {(user?.nick_name || user?.username || "A").charAt(0).toUpperCase()}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto px-6 py-6">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </ToastProvider>
  );
}
