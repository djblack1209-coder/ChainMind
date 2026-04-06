"use client";

// System Config — Grouped key-value config editor

import React, { useState, useEffect, useCallback } from "react";
import AdminPageIntro from "@/components/AdminPageIntro";
import { AdminModal, FormField, FormInput, ActionButton } from "@/components/AdminTable";
import { useToast } from "@/components/Toast";
import { toastError } from "@/app/admin/_utils/toast-error";

interface ConfigItem {
  id: number;
  key: string;
  value: string;
  group_name: string;
  description: string;
}

export default function ConfigPage() {
  const { toast } = useToast();
  const [data, setData] = useState<ConfigItem[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [activeGroup, setActiveGroup] = useState("");
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ key: "", value: "", group_name: "", description: "" });

  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchGroups = useCallback(async () => {
    if (!db) return;
    try {
      const g = await db.config.getGroups();
      setGroups(g || []);
    } catch (e) {
      toastError(toast, e, "加载配置分组失败");
    }
  }, [db, toast]);

  const fetchData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const list = await db.config.list(activeGroup || undefined);
      setData(list || []);
    } catch (e) {
      toastError(toast, e, "加载配置失败");
    }
    setLoading(false);
  }, [db, activeGroup, toast]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setForm({ key: "", value: "", group_name: activeGroup, description: "" });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!db || !form.key) return;
    try {
      await db.config.set(form.key, form.value, form.group_name, form.description);
      setModalOpen(false);
      fetchData();
      fetchGroups();
    } catch (e) {
      toastError(toast, e, "操作失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!db || !confirm("确定删除？")) return;
    try {
      await db.config.del(id);
      fetchData();
    } catch (e) {
      toastError(toast, e, "删除配置失败");
    }
  };

  const handleInlineEdit = async (item: ConfigItem, newValue: string) => {
    if (!db || newValue === item.value) return;
    try {
      await db.config.set(item.key, newValue, item.group_name, item.description);
      fetchData();
    } catch (e) {
      toastError(toast, e, "更新配置失败");
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="系统配置"
        description="按分组维护系统配置项，支持快速筛选、行内修改和值级别编辑。"
        chips={["Grouped config", "Inline editing", "Key registry"]}
        actions={<button onClick={openCreate} className="btn btn-primary px-4 py-2 text-sm">新增配置</button>}
      />

      <div className="flex gap-6">
        <div className="w-52 flex-shrink-0">
          <div className="panel-shell rounded-[28px] p-3">
            <button
              onClick={() => setActiveGroup("")}
              className={`w-full text-left px-3 py-2 rounded-2xl text-sm transition-colors ${!activeGroup ? "bg-[var(--brand-primary-soft)] text-[#ffc4b1] border border-[var(--border-primary)] font-medium" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"}`}
            >
              全部
            </button>
            {groups.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={`mt-2 w-full text-left px-3 py-2 rounded-2xl text-sm transition-colors ${activeGroup === g ? "bg-[var(--brand-primary-soft)] text-[#ffc4b1] border border-[var(--border-primary)] font-medium" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <span className="chip chip-muted">共 {data.length} 项配置</span>
          </div>

        <div className="rounded-[28px] border border-white/8 overflow-hidden bg-[linear-gradient(180deg,rgba(15,20,30,0.96),rgba(8,11,18,0.98))]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)]">
              <div className="w-4 h-4 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin mr-2" />
              加载中...
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-tertiary)] text-sm">暂无配置</div>
          ) : (
            <div className="divide-y divide-white/6">
              {data.map((item) => (
                <div key={item.id} className="flex items-center gap-4 px-4 py-3 bg-transparent hover:bg-[var(--bg-hover)] transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-[#ffc4b1]">{item.key}</span>
                      {item.group_name && (
                        <span className="chip chip-muted !px-2 !py-1 text-[10px]">{item.group_name}</span>
                      )}
                    </div>
                    {item.description && <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{item.description}</p>}
                  </div>
                  <input
                    defaultValue={item.value}
                    onBlur={(e) => handleInlineEdit(item, e.target.value)}
                    className="input w-48 text-xs font-mono"
                  />
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ActionButton variant="danger" onClick={() => handleDelete(item.id)}>删除</ActionButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title="新增配置">
        <FormField label="配置键" required>
          <FormInput value={form.key} onChange={(v) => setForm({ ...form, key: v })} placeholder="如：app.name" />
        </FormField>
        <FormField label="配置值" required>
          <FormInput value={form.value} onChange={(v) => setForm({ ...form, value: v })} placeholder="配置值" />
        </FormField>
        <FormField label="分组">
          <FormInput value={form.group_name} onChange={(v) => setForm({ ...form, group_name: v })} placeholder="如：system" />
        </FormField>
        <FormField label="描述">
          <FormInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="配置描述" />
        </FormField>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn btn-secondary px-4 py-2 text-sm">取消</button>
          <button onClick={handleSave} className="btn btn-primary px-4 py-2 text-sm">保存</button>
        </div>
      </AdminModal>
    </div>
  );
}
