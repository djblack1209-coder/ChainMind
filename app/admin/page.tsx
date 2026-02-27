"use client";

// Admin Dashboard — Overview stats + quick links

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/components/Toast";

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
  { key: "users", label: "用户数", color: "from-indigo-500 to-blue-500", path: "/admin/user" },
  { key: "roles", label: "角色数", color: "from-emerald-500 to-teal-500", path: "/admin/role" },
  { key: "menus", label: "菜单数", color: "from-amber-500 to-orange-500", path: "/admin/menu" },
  { key: "apis", label: "API数", color: "from-purple-500 to-pink-500", path: "/admin/api" },
  { key: "plugins", label: "插件数", color: "from-cyan-500 to-blue-400", path: "/admin/tools/plugin" },
  { key: "announcements", label: "公告数", color: "from-rose-500 to-red-400", path: "/admin/tools/announcement" },
  { key: "opLogs", label: "操作日志", color: "from-slate-500 to-gray-500", path: "/admin/logs/operation" },
  { key: "loginLogs", label: "登录日志", color: "from-violet-500 to-indigo-400", path: "/admin/logs/login" },
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
    if (!db) { setLoading(false); return; }
    try {
      const [users, roles, menus, apis, plugins, opLogs, loginLogs, errorLogs, announcements] = await Promise.all([
        db.user.list(1, 1).then(r => r.total),
        db.authority.list().then(r => r.length),
        db.menu.list().then(r => r.length),
        db.api.list(1, 1).then(r => r.total),
        db.plugin.list().then(r => r.length),
        db.opLog.list(1, 1).then(r => r.total),
        db.loginLog.list(1, 1).then(r => r.total),
        db.errorLog.list(1, 1).then(r => r.total),
        db.announcement.list(1, 1).then(r => r.total),
      ]);
      setStats({ users, roles, menus, apis, plugins, opLogs, loginLogs, errorLogs, announcements });

      // Recent login logs
      const recent = await db.loginLog.list(1, 5);
      setRecentLogs(recent.list || []);
    } catch (e: any) {
      toast("error", e?.message || "加载仪表盘数据失败");
    }
    setLoading(false);
  }, [db, toast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "上午好" : now.getHours() < 18 ? "下午好" : "晚上好";

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-500/10 to-cyan-500/10 border border-indigo-500/20 p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {greeting}\uff0c{user?.nick_name || user?.username || "管理员"}
        </h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          欢迎使用 ChainMind 管理后台
        </p>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)]">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
          加载统计数据...
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STAT_CARDS.map((card) => (
            <button
              key={card.key}
              onClick={() => router.push(card.path)}
              className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-4 hover:border-[var(--border-hover)] transition-all group text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-tertiary)]">{card.label}</span>
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${card.color} opacity-80 flex items-center justify-center`}>
                  <span className="text-white text-xs font-bold">
                    {String(stats[card.key as keyof Stats]).charAt(0)}
                  </span>
                </div>
              </div>
              <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
                {stats[card.key as keyof Stats]}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Recent login logs */}
      <div className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-secondary)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">最近登录</h3>
          <button
            onClick={() => router.push("/admin/logs/login")}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            查看全部
          </button>
        </div>
        <div className="divide-y divide-[var(--border-secondary)]">
          {recentLogs.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">暂无登录记录</div>
          ) : recentLogs.map((log: any) => (
            <div key={log.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <span className={`w-1.5 h-1.5 rounded-full ${log.status === 1 ? "bg-emerald-400" : "bg-red-400"}`} />
              <span className="text-[var(--text-secondary)] w-24 truncate">{log.username}</span>
              <span className="text-[var(--text-tertiary)] font-mono text-xs flex-1">{log.ip || "-"}</span>
              <span className="text-[var(--text-tertiary)] text-xs">
                {log.created_at ? new Date(log.created_at).toLocaleString("zh-CN") : "-"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "返回工作台", path: "/workspace", desc: "AI 链式协作" },
          { label: "系统配置", path: "/admin/config", desc: "全局参数设置" },
          { label: "个人中心", path: "/admin/profile", desc: "修改个人信息" },
        ].map((link) => (
          <button
            key={link.path}
            onClick={() => router.push(link.path)}
            className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-4 hover:border-[var(--border-hover)] transition-colors text-left"
          >
            <div className="text-sm font-medium text-[var(--text-primary)]">{link.label}</div>
            <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{link.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
