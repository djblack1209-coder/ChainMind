"use client";

// Menu Management — Tree editor with CRUD

import React, { useState, useEffect, useCallback } from "react";
import { AdminModal, FormField, FormInput, FormSelect, ActionButton } from "@/components/AdminTable";
import { useToast } from "@/components/Toast";

interface MenuNode {
  id: number;
  parent_id: number;
  path: string;
  name: string;
  component: string;
  title: string;
  icon: string;
  sort: number;
  hidden: number;
  children?: MenuNode[];
}

export default function MenuPage() {
  const { toast } = useToast();
  const [tree, setTree] = useState<MenuNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MenuNode | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({
    parent_id: "0", path: "", name: "", component: "", title: "", icon: "", sort: "0", hidden: "0",
  });

  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const data = await db.menu.tree();
      setTree(data || []);
      const ids = new Set<number>();
      (data || []).forEach((n: MenuNode) => ids.add(n.id));
      setExpandedIds(ids);
    } catch (e: any) {
      toast("error", e?.message || "加载菜单数据失败");
    }
    setLoading(false);
  }, [db, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openCreate = (parentId = 0) => {
    setEditing(null);
    setForm({ parent_id: String(parentId), path: "", name: "", component: "", title: "", icon: "", sort: "0", hidden: "0" });
    setModalOpen(true);
  };

  const openEdit = (node: MenuNode) => {
    setEditing(node);
    setForm({
      parent_id: String(node.parent_id),
      path: node.path || "",
      name: node.name || "",
      component: node.component || "",
      title: node.title || "",
      icon: node.icon || "",
      sort: String(node.sort || 0),
      hidden: String(node.hidden || 0),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!db || !form.title) return;
    const payload = {
      parent_id: Number(form.parent_id),
      path: form.path,
      name: form.name,
      component: form.component,
      title: form.title,
      icon: form.icon,
      sort: Number(form.sort),
      hidden: Number(form.hidden),
    };
    try {
      if (editing) {
        await db.menu.update(editing.id, payload);
      } else {
        await db.menu.create(payload);
      }
      setModalOpen(false);
      fetchData();
    } catch (e: any) { toast("error", e.message || "操作失败"); }
  };

  const handleDelete = async (id: number) => {
    if (!db || !confirm("确定删除该菜单及其子菜单？")) return;
    await db.menu.del(id);
    fetchData();
  };

  const renderTree = (nodes: MenuNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => {
      const hasChildren = node.children && node.children.length > 0;
      const expanded = expandedIds.has(node.id);
      return (
        <div key={node.id}>
          <div
            className="flex items-center gap-2 py-2 px-3 hover:bg-[var(--bg-hover)] rounded-lg transition-colors group"
            style={{ paddingLeft: `${depth * 24 + 12}px` }}
          >
            <button
              onClick={() => hasChildren && toggleExpand(node.id)}
              className={`w-5 h-5 flex items-center justify-center rounded text-[var(--text-tertiary)] ${hasChildren ? "hover:bg-[var(--bg-tertiary)]" : ""}`}
            >
              {hasChildren ? (
                <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--border-secondary)]" />
              )}
            </button>

            <span className="text-sm text-[var(--text-primary)] flex-1 truncate">
              {node.title}
              {node.path && (
                <span className="ml-2 text-xs text-[var(--text-tertiary)] font-mono">{node.path}</span>
              )}
            </span>

            <span className="text-xs text-[var(--text-tertiary)] tabular-nums w-8 text-right">{node.sort}</span>

            {node.hidden === 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">隐藏</span>
            )}

            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <ActionButton variant="success" onClick={() => openCreate(node.id)}>添加子菜单</ActionButton>
              <ActionButton variant="primary" onClick={() => openEdit(node)}>编辑</ActionButton>
              <ActionButton variant="danger" onClick={() => handleDelete(node.id)}>删除</ActionButton>
            </div>
          </div>
          {hasChildren && expanded && renderTree(node.children!, depth + 1)}
        </div>
      );
    });

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-[var(--text-tertiary)]">共 {countNodes(tree)} 个菜单项</span>
        <button onClick={() => openCreate(0)} className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors">
          新增根菜单
        </button>
      </div>

      <div className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-2 min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)]">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
            加载中...
          </div>
        ) : tree.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-tertiary)] text-sm">暂无菜单数据</div>
        ) : (
          renderTree(tree)
        )}
      </div>

      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑菜单" : "新增菜单"}>
        <div className="grid grid-cols-2 gap-x-4">
          <FormField label="菜单标题" required>
            <FormInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="如：用户管理" />
          </FormField>
          <FormField label="路由路径">
            <FormInput value={form.path} onChange={(v) => setForm({ ...form, path: v })} placeholder="如：/admin/user" />
          </FormField>
          <FormField label="路由名称">
            <FormInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="如：AdminUser" />
          </FormField>
          <FormField label="组件路径">
            <FormInput value={form.component} onChange={(v) => setForm({ ...form, component: v })} placeholder="如：view/admin/user" />
          </FormField>
          <FormField label="图标">
            <FormInput value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} placeholder="图标名称" />
          </FormField>
          <FormField label="父菜单ID">
            <FormInput value={form.parent_id} onChange={(v) => setForm({ ...form, parent_id: v })} placeholder="0 为根菜单" />
          </FormField>
          <FormField label="排序">
            <FormInput value={form.sort} onChange={(v) => setForm({ ...form, sort: v })} placeholder="数字越小越靠前" />
          </FormField>
          <FormField label="是否隐藏">
            <FormSelect value={form.hidden} onChange={(v) => setForm({ ...form, hidden: v })} options={[{ label: "显示", value: "0" }, { label: "隐藏", value: "1" }]} />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
        </div>
      </AdminModal>
    </>
  );
}

function countNodes(nodes: MenuNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + (n.children ? countNodes(n.children) : 0), 0);
}
