"use client";

// Announcement Management — CRUD with rich content

import React, { useState, useEffect, useCallback } from "react";
import AdminTable, { ActionButton, AdminModal, FormField, FormInput, FormSelect, StatusBadge } from "@/components/AdminTable";
import { useToast } from "@/components/Toast";
import { toastError } from "@/app/admin/_utils/toast-error";

interface Announcement {
  id: number;
  title: string;
  content: string;
  type: string;
  status: number;
  created_at: string;
  updated_at: string;
}

export default function AnnouncementPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState({ title: "", content: "", type: "notice", status: "1" });

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<Announcement | null>(null);

  const pageSize = 10;
  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const res = await db.announcement.list(page, pageSize, keyword);
      setData(res.list || []);
      setTotal(res.total || 0);
    } catch (e) {
      toastError(toast, e, "加载公告列表失败");
    }
    setLoading(false);
  }, [db, page, keyword, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", content: "", type: "notice", status: "1" });
    setModalOpen(true);
  };

  const openEdit = (row: Announcement) => {
    setEditing(row);
    setForm({ title: row.title, content: row.content || "", type: row.type || "notice", status: String(row.status) });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!db || !form.title) return;
    try {
      const payload = { ...form, status: Number(form.status) };
      if (editing) {
        await db.announcement.update(editing.id, payload);
      } else {
        await db.announcement.create(payload);
      }
      setModalOpen(false);
      fetchData();
    } catch (e) { toastError(toast, e, "操作失败"); }
  };

  const handleDelete = async (id: number) => {
    if (!db || !confirm("确定删除该公告？")) return;
    try {
      await db.announcement.del(id);
      fetchData();
    } catch (e) {
      toastError(toast, e, "删除公告失败");
    }
  };

  const TYPE_MAP: Record<string, string> = {
    notice: "通知",
    update: "更新",
    warning: "警告",
    event: "活动",
  };

  const TYPE_COLORS: Record<string, string> = {
    notice: "bg-blue-500/15 text-blue-400",
    update: "bg-emerald-500/15 text-emerald-400",
    warning: "bg-amber-500/15 text-amber-400",
    event: "bg-purple-500/15 text-purple-400",
  };

  const columns = [
    { key: "id", label: "ID", width: "60px" },
    { key: "title", label: "标题" },
    {
      key: "type", label: "类型", width: "80px",
      render: (v: string) => (
        <span className={`px-2 py-0.5 rounded text-xs ${TYPE_COLORS[v] || "bg-gray-500/15 text-gray-400"}`}>
          {TYPE_MAP[v] || v}
        </span>
      ),
    },
    {
      key: "status", label: "状态", width: "80px",
      render: (v: number) => <StatusBadge active={v === 1} activeText="发布" inactiveText="草稿" />,
    },
    {
      key: "created_at", label: "创建时间", width: "160px",
      render: (v: string) => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    {
      key: "_actions", label: "操作", width: "160px",
      render: (_: any, row: Announcement) => (
        <div className="flex items-center gap-1">
          <ActionButton variant="default" onClick={() => { setPreviewItem(row); setPreviewOpen(true); }}>预览</ActionButton>
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
        searchPlaceholder="搜索公告标题..."
        actions={
          <button onClick={openCreate} className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors">
            新增公告
          </button>
        }
      />

      {/* Create/Edit */}
      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑公告" : "新增公告"} width="max-w-xl">
        <FormField label="标题" required>
          <FormInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="公告标题" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="类型">
            <FormSelect
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v })}
              options={Object.entries(TYPE_MAP).map(([k, v]) => ({ label: v, value: k }))}
            />
          </FormField>
          <FormField label="状态">
            <FormSelect
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v })}
              options={[{ label: "发布", value: "1" }, { label: "草稿", value: "0" }]}
            />
          </FormField>
        </div>
        <FormField label="内容">
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={6}
            placeholder="公告内容..."
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-indigo-500 resize-none"
          />
        </FormField>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">保存</button>
        </div>
      </AdminModal>

      {/* Preview */}
      <AdminModal open={previewOpen} onClose={() => setPreviewOpen(false)} title={previewItem?.title || "预览"} width="max-w-xl">
        <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
          {previewItem?.content || "无内容"}
        </div>
        <div className="mt-4 text-xs text-[var(--text-tertiary)]">
          发布于 {previewItem?.created_at ? new Date(previewItem.created_at).toLocaleString("zh-CN") : "-"}
        </div>
      </AdminModal>
    </>
  );
}
