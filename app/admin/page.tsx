"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/components/Toast";
import { toastError } from "@/app/admin/_utils/toast-error";

interface Stats {
  users: number;
  roles: number;
  menus: number;
  apis: number;
  plugins: number;
  opLogs: number;
  loginLogs: number;
  errorLogs: number;
  announcements: number;
}

const STAT_CARDS = [
  { key: "users", label: "用户数", accent: "warm", path: "/admin/user" },
  { key: "roles", label: "角色数", accent: "cool", path: "/admin/role" },
  { key: "menus", label: "菜单数", accent: "warm", path: "/admin/menu" },
  { key: "apis", label: "API数", accent: "cool", path: "/admin/api" },
  { key: "plugins", label: "插件数", accent: "cool", path: "/admin/tools/plugin" },
  { key: "announcements", label: "公告数", accent: "warm", path: "/admin/tools/announcement" },
  { key: "opLogs", label: "操作日志", accent: "neutral", path: "/admin/logs/operation" },
  { key: "loginLogs", label: "登录日志", accent: "neutral", path: "/admin/logs/login" },
] as const;

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats>({
    users: 0, roles: 0, menus: 0, apis: 0, plugins: 0,
    opLogs: 0, loginLogs: 0, errorLogs: 0, announcements: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchStats = useCallback(async () => {
    if (!db) {
      setLoading(false);
      return;
    }

    try {
      const [users, roles, menus, apis, plugins, opLogs, loginLogs, errorLogs, announcements] = await Promise.all([
        db.user.list(1, 1).then((r) => r.total),
        db.authority.list().then((r) => r.length),
        db.menu.list().then((r) => r.length),
        db.api.list(1, 1).then((r) => r.total),
        db.plugin.list().then((r) => r.length),
        db.opLog.list(1, 1).then((r) => r.total),
        db.loginLog.list(1, 1).then((r) => r.total),
        db.errorLog.list(1, 1).then((r) => r.total),
        db.announcement.list(1, 1).then((r) => r.total),
      ]);
      setStats({ users, roles, menus, apis, plugins, opLogs, loginLogs, errorLogs, announcements });

      const recent = await db.loginLog.list(1, 5);
      setRecentLogs(recent.list || []);
    } catch (e) {
      toastError(toast, e, "加载仪表盘数据失败");
    }
    setLoading(false);
  }, [db, toast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "上午好" : now.getHours() < 18 ? "下午好" : "晚上好";

  return (
    <div className="space-y-6">
      <div className="panel-shell rounded-[32px] p-6 sm:p-8">
        <div className="section-kicker">Admin overview</div>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-4xl text-[var(--text-primary)] sm:text-5xl">
              {greeting}，{user?.nick_name || user?.username || "管理员"}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
              这里集中展示 ChainMind 的系统状态、管理入口和最近活动。你可以从这里快速进入任意后台模块。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="chip chip-warm">System control</span>
            <span className="chip chip-cool">Audit ready</span>
            <span className="chip">Desktop admin</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="panel-shell flex items-center justify-center rounded-[28px] py-14 text-[var(--text-tertiary)]">
          <div className="mr-3 h-5 w-5 rounded-full border-2 border-[var(--brand-primary)] border-t-transparent animate-spin" />
          加载统计数据...
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STAT_CARDS.map((card) => {
            const accentClass = card.accent === "cool" ? "chip chip-cool" : card.accent === "warm" ? "chip chip-warm" : "chip chip-muted";
            return (
              <button
                key={card.key}
                onClick={() => router.push(card.path)}
                className="panel-card group p-5 text-left transition hover:-translate-y-[1px] hover:border-[var(--border-primary)]"
              >
                <div className="flex items-center justify-between">
                  <span className="meta-label">{card.label}</span>
                  <span className={accentClass}>{card.accent}</span>
                </div>
                <div className="mt-6 text-4xl font-semibold text-[var(--text-primary)] tabular-nums">
                  {stats[card.key as keyof Stats]}
                </div>
                <div className="mt-3 text-sm text-[var(--text-tertiary)]">点击进入 {card.label} 管理</div>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,20,30,0.96),rgba(8,11,18,0.98))] overflow-hidden shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div>
              <div className="meta-label">Recent access</div>
              <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">最近登录</h3>
            </div>
            <button onClick={() => router.push("/admin/logs/login")} className="btn btn-secondary px-4 py-2 text-xs">
              查看全部
            </button>
          </div>
          <div className="divide-y divide-white/6">
            {recentLogs.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-[var(--text-tertiary)]">暂无登录记录</div>
            ) : recentLogs.map((log: any) => (
              <div key={log.id} className="flex items-center gap-4 px-5 py-4 text-sm">
                <span className={`h-2 w-2 rounded-full ${log.status === 1 ? "bg-emerald-300" : "bg-rose-300"}`} />
                <span className="w-24 truncate text-[var(--text-secondary)]">{log.username}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-tertiary)]">{log.ip || "-"}</span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {log.created_at ? new Date(log.created_at).toLocaleString("zh-CN") : "-"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel-shell rounded-[28px] p-5">
            <div className="meta-label">Quick links</div>
            <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">常用入口</h3>
            <div className="mt-4 grid gap-3">
              {[
                { label: "返回工作台", path: "/workspace", desc: "回到 AI 链式协作台" },
                { label: "系统配置", path: "/admin/config", desc: "维护全局参数与配置项" },
                { label: "个人中心", path: "/admin/profile", desc: "修改个人信息与账户资料" },
              ].map((link) => (
                <button
                  key={link.path}
                  onClick={() => router.push(link.path)}
                  className="panel-card p-4 text-left transition hover:border-[var(--border-primary)]"
                >
                  <div className="text-base font-medium text-[var(--text-primary)]">{link.label}</div>
                  <div className="mt-2 text-sm leading-7 text-[var(--text-tertiary)]">{link.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel-shell rounded-[28px] p-5">
            <div className="meta-label">Health summary</div>
            <div className="mt-4 flex flex-wrap gap-3">
              <span className="chip chip-cool">用户 {stats.users}</span>
              <span className="chip chip-warm">插件 {stats.plugins}</span>
              <span className="chip chip-muted">错误日志 {stats.errorLogs}</span>
            </div>
            <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
              如果你需要进一步检查运行状态，可以从日志审计与系统工具区域继续深入。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
