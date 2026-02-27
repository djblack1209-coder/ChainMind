"use client";

// Plugin Registry Management — View/toggle/configure plugins

import React, { useState, useEffect, useCallback } from "react";
import { AdminModal, FormField, FormInput, StatusBadge } from "@/components/AdminTable";
import { useToast } from "@/components/Toast";
import { toastError } from "@/app/admin/_utils/toast-error";

interface PluginRecord {
  id: number;
  name: string;
  display_name: string;
  description: string;
  version: string;
  author: string;
  enabled: number;
  config: string;
  created_at: string;
}

export default function PluginPage() {
  const { toast } = useToast();
  const [data, setData] = useState<PluginRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [form, setForm] = useState({ name: "", display_name: "", description: "", version: "1.0.0", author: "" });

  const [configOpen, setConfigOpen] = useState(false);
  const [configTarget, setConfigTarget] = useState<PluginRecord | null>(null);
  const [configText, setConfigText] = useState("");

  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const list = await db.plugin.list();
      setData(list || []);
    } catch (e) {
      toastError(toast, e, "加载插件列表失败");
    }
    setLoading(false);
  }, [db, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (name: string, enabled: boolean) => {
    if (!db) return;
    try {
      await db.plugin.toggle(name, enabled);
      fetchData();
    } catch (e) {
      toastError(toast, e, "切换插件状态失败");
    }
  };

  const handleDelete = async (name: string) => {
    if (!db || !confirm("确定删除该插件？")) return;
    try {
      await db.plugin.del(name);
      fetchData();
    } catch (e) {
      toastError(toast, e, "删除插件失败");
    }
  };

  const handleRegister = async () => {
    if (!db || !form.name) return;
    try {
      await db.plugin.register(form);
      setRegisterOpen(false);
      fetchData();
    } catch (e) { toastError(toast, e, "操作失败"); }
  };

  const openConfig = (p: PluginRecord) => {
    setConfigTarget(p);
    setConfigText(p.config || "{}");
    setConfigOpen(true);
  };

  const saveConfig = async () => {
    if (!db || !configTarget) return;
    try {
      const parsed = JSON.parse(configText);
      await db.plugin.updateConfig(configTarget.name, parsed);
      setConfigOpen(false);
      fetchData();
    } catch (e) { toastError(toast, e, "JSON格式错误"); }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-[var(--text-tertiary)]">共 {data.length} 个插件</span>
        <button onClick={() => { setForm({ name: "", display_name: "", description: "", version: "1.0.0", author: "" }); setRegisterOpen(true); }}
          className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors">
          注册插件
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)]">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
          加载中...
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-tertiary)] text-sm rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)]">
          暂无已注册插件
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((p) => (
            <div key={p.name} className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-4 hover:border-[var(--border-hover)] transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{p.display_name || p.name}</h3>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{p.description || "无描述"}</p>
                </div>
                <StatusBadge active={p.enabled === 1} />
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)] mb-3">
                <span>v{p.version}</span>
                {p.author && <span>by {p.author}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(p.name, p.enabled !== 1)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${p.enabled === 1 ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"}`}
                >
                  {p.enabled === 1 ? "禁用" : "启用"}
                </button>
                <button onClick={() => openConfig(p)} className="px-2.5 py-1 rounded-md text-xs bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                  配置
                </button>
                <button onClick={() => handleDelete(p.name)} className="px-2.5 py-1 rounded-md text-xs text-red-400 hover:bg-red-500/10 transition-colors ml-auto">
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Register */}
      <AdminModal open={registerOpen} onClose={() => setRegisterOpen(false)} title="注册插件">
        <FormField label="插件标识" required>
          <FormInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="如：my-plugin" />
        </FormField>
        <FormField label="显示名称">
          <FormInput value={form.display_name} onChange={(v) => setForm({ ...form, display_name: v })} placeholder="我的插件" />
        </FormField>
        <FormField label="描述">
          <FormInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="插件描述" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="版本">
            <FormInput value={form.version} onChange={(v) => setForm({ ...form, version: v })} placeholder="1.0.0" />
          </FormField>
          <FormField label="作者">
            <FormInput value={form.author} onChange={(v) => setForm({ ...form, author: v })} placeholder="作者" />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setRegisterOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleRegister} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">注册</button>
        </div>
      </AdminModal>

      {/* Config editor */}
      <AdminModal open={configOpen} onClose={() => setConfigOpen(false)} title={`配置 — ${configTarget?.display_name || configTarget?.name || ""}`}>
        <textarea
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-indigo-500 resize-none"
          spellCheck={false}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setConfigOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={saveConfig} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
        </div>
      </AdminModal>
    </>
  );
}
