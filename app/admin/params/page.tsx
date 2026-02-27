"use client";

// System Params Management — Key-value CRUD

import React, { useState, useEffect, useCallback } from "react";
import AdminTable, { ActionButton, AdminModal, FormField, FormInput } from "@/components/AdminTable";
import { useToast } from "@/components/Toast";

interface Param {
  id: number;
  key: string;
  value: string;
  description: string;
  created_at: string;
}

export default function ParamsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Param[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Param | null>(null);
  const [form, setForm] = useState({ key: "", value: "", description: "" });

  const pageSize = 15;
  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const res = await db.params.list(page, pageSize, keyword);
      setData(res.list || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      toast("error", e?.message || "加载系统参数失败");
    }
    setLoading(false);
  }, [db, page, keyword, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setForm({ key: "", value: "", description: "" });
    setModalOpen(true);
  };

  const openEdit = (row: Param) => {
    setEditing(row);
    setForm({ key: row.key, value: row.value, description: row.description || "" });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!db || !form.key) return;
    try {
      if (editing) {
        await db.params.update(editing.id, form);
      } else {
        await db.params.create(form);
      }
      setModalOpen(false);
      fetchData();
    } catch (e: any) { toast("error", e.message || "操作失败"); }
  };

  const handleDelete = async (id: number) => {
    if (!db || !confirm("确定删除？")) return;
    try {
      await db.params.del(id);
      fetchData();
    } catch (e: any) {
      toast("error", e?.message || "删除参数失败");
    }
  };

  const columns = [
    { key: "id", label: "ID", width: "60px" },
    { key: "key", label: "参数键", render: (v: string) => <span className="font-mono text-xs text-indigo-400">{v}</span> },
    { key: "value", label: "参数值", render: (v: string) => <span className="font-mono text-xs">{v}</span> },
    { key: "description", label: "描述", render: (v: string) => v || "-" },
    {
      key: "_actions", label: "操作", width: "120px",
      render: (_: any, row: Param) => (
        <div className="flex items-center gap-1">
          <ActionButton variant="primary" onClick={() => openEdit(row)}>编辑</ActionButton>
          <ActionButton variant="danger" onClick={() => handleDelete(row.id)}>删除</ActionButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <AdminTable
        columns={columns} data={data} total={total} page={page} pageSize={pageSize}
        loading={loading} onPageChange={setPage}
        onSearch={(kw) => { setKeyword(kw); setPage(1); }}
        searchPlaceholder="搜索参数键..."
        actions={
          <button onClick={openCreate} className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors">
            新增参数
          </button>
        }
      />
      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑参数" : "新增参数"}>
        <FormField label="参数键" required>
          <FormInput value={form.key} onChange={(v) => setForm({ ...form, key: v })} placeholder="如：site_name" disabled={!!editing} />
        </FormField>
        <FormField label="参数值" required>
          <FormInput value={form.value} onChange={(v) => setForm({ ...form, value: v })} placeholder="参数值" />
        </FormField>
        <FormField label="描述">
          <FormInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="参数描述" />
        </FormField>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
        </div>
      </AdminModal>
    </>
  );
}
