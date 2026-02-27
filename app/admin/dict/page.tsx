"use client";

// Dictionary Management — CRUD with detail sub-items

import React, { useState, useEffect, useCallback } from "react";
import AdminTable, { ActionButton, AdminModal, FormField, FormInput } from "@/components/AdminTable";
import { useToast } from "@/components/Toast";
import { toastError } from "@/app/admin/_utils/toast-error";

interface Dict {
  id: number;
  name: string;
  type: string;
  status: number;
  description: string;
  created_at: string;
}

interface DictDetail {
  id: number;
  dict_id: number;
  label: string;
  value: string;
  sort: number;
  status: number;
}

export default function DictPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Dict[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Dict | null>(null);
  const [form, setForm] = useState({ name: "", type: "", description: "" });

  // Detail panel
  const [detailDict, setDetailDict] = useState<Dict | null>(null);
  const [details, setDetails] = useState<DictDetail[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editingDetail, setEditingDetail] = useState<DictDetail | null>(null);
  const [detailForm, setDetailForm] = useState({ label: "", value: "", sort: "0" });

  const pageSize = 10;
  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const res = await db.dict.list(page, pageSize, keyword);
      setData(res.list || []);
      setTotal(res.total || 0);
    } catch (e) {
      toastError(toast, e, "加载字典列表失败");
    }
    setLoading(false);
  }, [db, page, keyword, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetails = useCallback(async (dictId: number) => {
    if (!db) return;
    try {
      const list = await db.dict.getDetails(dictId);
      setDetails(list || []);
    } catch (e) {
      toastError(toast, e, "加载字典详情失败");
    }
  }, [db, toast]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", type: "", description: "" });
    setModalOpen(true);
  };

  const openEdit = (row: Dict) => {
    setEditing(row);
    setForm({ name: row.name, type: row.type, description: row.description || "" });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!db || !form.name || !form.type) return;
    try {
      if (editing) {
        await db.dict.update(editing.id, form);
      } else {
        await db.dict.create(form);
      }
      setModalOpen(false);
      fetchData();
    } catch (e) { toastError(toast, e, "操作失败"); }
  };

  const handleDelete = async (id: number) => {
    if (!db || !confirm("确定删除该字典？")) return;
    try {
      await db.dict.del(id);
      fetchData();
      if (detailDict?.id === id) setDetailDict(null);
    } catch (e) {
      toastError(toast, e, "删除字典失败");
    }
  };

  const openDetails = (row: Dict) => {
    setDetailDict(row);
    fetchDetails(row.id);
  };

  const openCreateDetail = () => {
    setEditingDetail(null);
    setDetailForm({ label: "", value: "", sort: "0" });
    setDetailModalOpen(true);
  };

  const openEditDetail = (d: DictDetail) => {
    setEditingDetail(d);
    setDetailForm({ label: d.label, value: d.value, sort: String(d.sort) });
    setDetailModalOpen(true);
  };

  const handleSaveDetail = async () => {
    if (!db || !detailDict || !detailForm.label) return;
    try {
      if (editingDetail) {
        await db.dict.updateDetail(editingDetail.id, { ...detailForm, sort: Number(detailForm.sort) });
      } else {
        await db.dict.createDetail({ sys_dictionary_id: detailDict.id, ...detailForm, sort: Number(detailForm.sort) });
      }
      setDetailModalOpen(false);
      fetchDetails(detailDict.id);
    } catch (e) { toastError(toast, e, "操作失败"); }
  };

  const handleDeleteDetail = async (id: number) => {
    if (!db || !detailDict || !confirm("确定删除？")) return;
    try {
      await db.dict.delDetail(id);
      fetchDetails(detailDict.id);
    } catch (e) {
      toastError(toast, e, "删除字典详情失败");
    }
  };

  const columns = [
    { key: "id", label: "ID", width: "60px" },
    { key: "name", label: "字典名称" },
    { key: "type", label: "字典类型", render: (v: string) => <span className="font-mono text-xs text-indigo-400">{v}</span> },
    { key: "description", label: "描述", render: (v: string) => v || "-" },
    {
      key: "_actions", label: "操作", width: "180px",
      render: (_: any, row: Dict) => (
        <div className="flex items-center gap-1">
          <ActionButton variant="success" onClick={() => openDetails(row)}>详情</ActionButton>
          <ActionButton variant="primary" onClick={() => openEdit(row)}>编辑</ActionButton>
          <ActionButton variant="danger" onClick={() => handleDelete(row.id)}>删除</ActionButton>
        </div>
      ),
    },
  ];

  return (
    <div className="flex gap-6">
      {/* Left: dict list */}
      <div className="flex-1 min-w-0">
        <AdminTable
          columns={columns} data={data} total={total} page={page} pageSize={pageSize}
          loading={loading} onPageChange={setPage}
          onSearch={(kw) => { setKeyword(kw); setPage(1); }}
          searchPlaceholder="搜索字典名称..."
          actions={
            <button onClick={openCreate} className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors">
              新增字典
            </button>
          }
        />
      </div>

      {/* Right: detail panel */}
      {detailDict && (
        <div className="w-80 flex-shrink-0">
          <div className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{detailDict.name} 详情</h3>
              <button onClick={openCreateDetail} className="text-xs text-indigo-400 hover:text-indigo-300">+ 添加</button>
            </div>
            <div className="space-y-1.5">
              {details.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] text-center py-4">暂无详情项</p>
              ) : details.map((d) => (
                <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-hover)] group">
                  <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{d.label}</span>
                  <span className="text-xs text-[var(--text-tertiary)] font-mono">{d.value}</span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">#{d.sort}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                    <ActionButton variant="primary" onClick={() => openEditDetail(d)}>编辑</ActionButton>
                    <ActionButton variant="danger" onClick={() => handleDeleteDetail(d.id)}>删除</ActionButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dict modal */}
      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑字典" : "新增字典"}>
        <FormField label="字典名称" required>
          <FormInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="如：性别" />
        </FormField>
        <FormField label="字典类型" required>
          <FormInput value={form.type} onChange={(v) => setForm({ ...form, type: v })} placeholder="如：gender" />
        </FormField>
        <FormField label="描述">
          <FormInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="字典描述" />
        </FormField>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
        </div>
      </AdminModal>

      {/* Detail modal */}
      <AdminModal open={detailModalOpen} onClose={() => setDetailModalOpen(false)} title={editingDetail ? "编辑详情" : "新增详情"} width="max-w-sm">
        <FormField label="标签" required>
          <FormInput value={detailForm.label} onChange={(v) => setDetailForm({ ...detailForm, label: v })} placeholder="显示文本" />
        </FormField>
        <FormField label="值" required>
          <FormInput value={detailForm.value} onChange={(v) => setDetailForm({ ...detailForm, value: v })} placeholder="存储值" />
        </FormField>
        <FormField label="排序">
          <FormInput value={detailForm.sort} onChange={(v) => setDetailForm({ ...detailForm, sort: v })} placeholder="0" />
        </FormField>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setDetailModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleSaveDetail} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
        </div>
      </AdminModal>
    </div>
  );
}
