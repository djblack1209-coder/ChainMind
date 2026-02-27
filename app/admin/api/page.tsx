"use client";

// API Management Page — CRUD table with method/group filters

import React, { useState, useEffect, useCallback } from "react";
import AdminTable, { ActionButton, AdminModal, FormField, FormInput, FormSelect } from "@/components/AdminTable";
import { useToast } from "@/components/Toast";

interface ApiRecord {
  id: number;
  path: string;
  description: string;
  api_group: string;
  method: string;
  created_at: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400",
  POST: "bg-blue-500/15 text-blue-400",
  PUT: "bg-amber-500/15 text-amber-400",
  DELETE: "bg-red-500/15 text-red-400",
  PATCH: "bg-purple-500/15 text-purple-400",
};

export default function ApiPage() {
  const { toast } = useToast();
  const [data, setData] = useState<ApiRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [groups, setGroups] = useState<string[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApiRecord | null>(null);
  const [form, setForm] = useState({ path: "", description: "", api_group: "", method: "GET" });

  const pageSize = 15;
  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const res = await db.api.list(page, pageSize, keyword, filterMethod, filterGroup);
      setData(res.list || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      toast("error", e?.message || "加载API列表失败");
    }
    setLoading(false);
  }, [db, page, keyword, filterMethod, filterGroup, toast]);

  const fetchGroups = useCallback(async () => {
    if (!db) return;
    try {
      const g = await db.api.getGroups();
      setGroups(g || []);
    } catch (e: any) {
      toast("error", e?.message || "加载API分组失败");
    }
  }, [db, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const openCreate = () => {
    setEditing(null);
    setForm({ path: "", description: "", api_group: "", method: "GET" });
    setModalOpen(true);
  };

  const openEdit = (row: ApiRecord) => {
    setEditing(row);
    setForm({ path: row.path, description: row.description || "", api_group: row.api_group || "", method: row.method });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!db || !form.path) return;
    try {
      if (editing) {
        await db.api.update(editing.id, form);
      } else {
        await db.api.create(form);
      }
      setModalOpen(false);
      fetchData();
      fetchGroups();
    } catch (e: any) { toast("error", e.message || "操作失败"); }
  };

  const handleDelete = async (id: number) => {
    if (!db || !confirm("确定删除该API？")) return;
    try {
      await db.api.del(id);
      fetchData();
    } catch (e: any) {
      toast("error", e?.message || "删除API失败");
    }
  };

  const columns = [
    { key: "id", label: "ID", width: "60px" },
    {
      key: "method",
      label: "方法",
      width: "80px",
      render: (v: string) => (
        <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${METHOD_COLORS[v] || "bg-gray-500/15 text-gray-400"}`}>
          {v}
        </span>
      ),
    },
    { key: "path", label: "路径", render: (v: string) => <span className="font-mono text-xs">{v}</span> },
    { key: "description", label: "描述", render: (v: string) => v || "-" },
    { key: "api_group", label: "分组", render: (v: string) => v || "-" },
    {
      key: "_actions",
      label: "操作",
      width: "120px",
      render: (_: any, row: ApiRecord) => (
        <div className="flex items-center gap-1">
          <ActionButton variant="primary" onClick={() => openEdit(row)}>编辑</ActionButton>
          <ActionButton variant="danger" onClick={() => handleDelete(row.id)}>删除</ActionButton>
        </div>
      ),
    },
  ];

  return (
    <>
      {/* Extra filters */}
      <div className="flex items-center gap-2 mb-4">
        <select
          value={filterMethod}
          onChange={(e) => { setFilterMethod(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
        >
          <option value="">全部方法</option>
          {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={filterGroup}
          onChange={(e) => { setFilterGroup(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
        >
          <option value="">全部分组</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <AdminTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        onPageChange={setPage}
        onSearch={(kw) => { setKeyword(kw); setPage(1); }}
        searchPlaceholder="搜索路径/描述..."
        actions={
          <button onClick={openCreate} className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors">
            新增API
          </button>
        }
      />

      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑API" : "新增API"}>
        <FormField label="请求路径" required>
          <FormInput value={form.path} onChange={(v) => setForm({ ...form, path: v })} placeholder="/api/v1/xxx" />
        </FormField>
        <FormField label="请求方法" required>
          <FormSelect
            value={form.method}
            onChange={(v) => setForm({ ...form, method: v })}
            options={["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => ({ label: m, value: m }))}
          />
        </FormField>
        <FormField label="API分组">
          <FormInput value={form.api_group} onChange={(v) => setForm({ ...form, api_group: v })} placeholder="如：user, system" />
        </FormField>
        <FormField label="描述">
          <FormInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="接口描述" />
        </FormField>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
        </div>
      </AdminModal>
    </>
  );
}
