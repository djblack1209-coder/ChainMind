"use client";

// Role/Authority Management — CRUD + menu assignment + Casbin policy editor

import React, { useState, useEffect, useCallback } from "react";
import AdminTable, {
  ActionButton,
  AdminModal,
  FormField,
  FormInput,
} from "@/components/AdminTable";
import { useToast } from "@/components/Toast";
import { toastError } from "@/app/admin/_utils/toast-error";

interface Authority {
  authority_id: number;
  authority_name: string;
  parent_id: number;
  created_at: string;
}

interface MenuNode {
  id: number;
  title: string;
  parent_id: number;
  children?: MenuNode[];
}

export default function RolePage() {
  const { toast } = useToast();
  const [data, setData] = useState<Authority[]>([]);
  const [loading, setLoading] = useState(false);

  // Create/Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Authority | null>(null);
  const [form, setForm] = useState({ authority_id: "", authority_name: "", parent_id: "0" });

  // Menu assignment
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [menuTarget, setMenuTarget] = useState<Authority | null>(null);
  const [allMenus, setAllMenus] = useState<MenuNode[]>([]);
  const [checkedMenuIds, setCheckedMenuIds] = useState<Set<number>>(new Set());

  // Casbin rules
  const [casbinOpen, setCasbinOpen] = useState(false);
  const [casbinTarget, setCasbinTarget] = useState<Authority | null>(null);
  const [casbinRules, setCasbinRules] = useState<{ path: string; method: string }[]>([]);
  const [newRule, setNewRule] = useState({ path: "", method: "GET" });

  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const list = await db.authority.list();
      setData(list || []);
    } catch (e) {
      toastError(toast, e, "加载角色列表失败");
    }
    setLoading(false);
  }, [db, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setForm({ authority_id: "", authority_name: "", parent_id: "0" });
    setModalOpen(true);
  };

  const openEdit = (row: Authority) => {
    setEditing(row);
    setForm({ authority_id: String(row.authority_id), authority_name: row.authority_name, parent_id: String(row.parent_id) });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!db || !form.authority_name) return;
    try {
      if (editing) {
        await db.authority.update(editing.authority_id, { authority_name: form.authority_name, parent_id: Number(form.parent_id) });
      } else {
        if (!form.authority_id) return;
        await db.authority.create({ authority_id: Number(form.authority_id), authority_name: form.authority_name, parent_id: Number(form.parent_id) });
      }
      setModalOpen(false);
      fetchData();
    } catch (e) {
      toastError(toast, e, "操作失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!db || !confirm("确定删除该角色？")) return;
    try {
      await db.authority.del(id);
      fetchData();
    } catch (e) {
      toastError(toast, e, "删除角色失败");
    }
  };

  // Menu assignment
  const openMenuAssign = async (row: Authority) => {
    if (!db) return;
    try {
      setMenuTarget(row);
      const [tree, ids] = await Promise.all([db.menu.tree(), db.authority.getMenuIds(row.authority_id)]);
      setAllMenus(tree || []);
      setCheckedMenuIds(new Set(ids || []));
      setMenuModalOpen(true);
    } catch (e) {
      toastError(toast, e, "加载角色菜单权限失败");
    }
  };

  const toggleMenu = (id: number) => {
    setCheckedMenuIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveMenus = async () => {
    if (!db || !menuTarget) return;
    try {
      await db.authority.setMenus(menuTarget.authority_id, Array.from(checkedMenuIds));
      setMenuModalOpen(false);
    } catch (e) {
      toastError(toast, e, "保存菜单权限失败");
    }
  };

  // Casbin
  const openCasbin = async (row: Authority) => {
    if (!db) return;
    try {
      setCasbinTarget(row);
      const rules = await db.authority.getCasbinRules(row.authority_id);
      setCasbinRules(rules || []);
      setCasbinOpen(true);
    } catch (e) {
      toastError(toast, e, "加载API权限规则失败");
    }
  };

  const addCasbinRule = () => {
    if (!newRule.path) return;
    setCasbinRules([...casbinRules, { ...newRule }]);
    setNewRule({ path: "", method: "GET" });
  };

  const removeCasbinRule = (idx: number) => {
    setCasbinRules(casbinRules.filter((_, i) => i !== idx));
  };

  const saveCasbin = async () => {
    if (!db || !casbinTarget) return;
    try {
      await db.authority.setCasbinRules(casbinTarget.authority_id, casbinRules);
      setCasbinOpen(false);
    } catch (e) {
      toastError(toast, e, "保存API权限失败");
    }
  };

  const renderMenuTree = (nodes: MenuNode[], depth = 0) =>
    nodes.map((node) => (
      <div key={node.id}>
        <label
          className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--bg-hover)] rounded px-2"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <input
            type="checkbox"
            checked={checkedMenuIds.has(node.id)}
            onChange={() => toggleMenu(node.id)}
            className="rounded border-[var(--border-secondary)] text-indigo-500 focus:ring-indigo-500/30"
          />
          <span className="text-sm text-[var(--text-secondary)]">{node.title}</span>
        </label>
        {node.children && renderMenuTree(node.children, depth + 1)}
      </div>
    ));

  const columns = [
    { key: "authority_id", label: "角色ID", width: "100px" },
    { key: "authority_name", label: "角色名称" },
    { key: "parent_id", label: "父角色", width: "100px", render: (v: number) => v === 0 ? "根" : String(v) },
    { key: "created_at", label: "创建时间", render: (v: string) => v ? new Date(v).toLocaleString("zh-CN") : "-" },
    {
      key: "_actions",
      label: "操作",
      width: "280px",
      render: (_: any, row: Authority) => (
        <div className="flex items-center gap-1">
          <ActionButton variant="primary" onClick={() => openEdit(row)}>编辑</ActionButton>
          <ActionButton variant="success" onClick={() => openMenuAssign(row)}>分配菜单</ActionButton>
          <ActionButton variant="default" onClick={() => openCasbin(row)}>API权限</ActionButton>
          <ActionButton variant="danger" onClick={() => handleDelete(row.authority_id)}>删除</ActionButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <AdminTable
        columns={columns}
        data={data}
        total={data.length}
        page={1}
        pageSize={999}
        loading={loading}
        onPageChange={() => {}}
        actions={
          <button onClick={openCreate} className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors">
            新增角色
          </button>
        }
      />

      {/* Create/Edit */}
      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑角色" : "新增角色"}>
        {!editing && (
          <FormField label="角色ID" required>
            <FormInput value={form.authority_id} onChange={(v) => setForm({ ...form, authority_id: v })} placeholder="如 888" />
          </FormField>
        )}
        <FormField label="角色名称" required>
          <FormInput value={form.authority_name} onChange={(v) => setForm({ ...form, authority_name: v })} placeholder="请输入角色名称" />
        </FormField>
        <FormField label="父角色ID">
          <FormInput value={form.parent_id} onChange={(v) => setForm({ ...form, parent_id: v })} placeholder="0 表示根角色" />
        </FormField>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
        </div>
      </AdminModal>

      {/* Menu Assignment */}
      <AdminModal open={menuModalOpen} onClose={() => setMenuModalOpen(false)} title={`分配菜单 — ${menuTarget?.authority_name || ""}`}>
        <div className="max-h-80 overflow-y-auto border border-[var(--border-secondary)] rounded-lg p-2">
          {allMenus.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] text-center py-4">暂无菜单</p>
          ) : (
            renderMenuTree(allMenus)
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setMenuModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={saveMenus} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
        </div>
      </AdminModal>

      {/* Casbin Rules */}
      <AdminModal open={casbinOpen} onClose={() => setCasbinOpen(false)} title={`API权限 — ${casbinTarget?.authority_name || ""}`} width="max-w-xl">
        <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
          {casbinRules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-mono text-xs min-w-[60px] text-center">
                {rule.method}
              </span>
              <span className="flex-1 text-[var(--text-secondary)] font-mono text-xs">{rule.path}</span>
              <ActionButton variant="danger" onClick={() => removeCasbinRule(idx)}>移除</ActionButton>
            </div>
          ))}
          {casbinRules.length === 0 && <p className="text-sm text-[var(--text-tertiary)] text-center py-2">暂无规则</p>}
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--border-secondary)] pt-3">
          <input
            value={newRule.path}
            onChange={(e) => setNewRule({ ...newRule, path: e.target.value })}
            placeholder="/api/xxx"
            className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-indigo-500"
          />
          <select
            value={newRule.method}
            onChange={(e) => setNewRule({ ...newRule, method: e.target.value })}
            className="px-2 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
          >
            {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button onClick={addCasbinRule} className="px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-400 text-sm hover:bg-indigo-500/25">添加</button>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setCasbinOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={saveCasbin} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
        </div>
      </AdminModal>
    </>
  );
}
