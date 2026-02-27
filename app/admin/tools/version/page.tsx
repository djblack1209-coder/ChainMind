"use client";

// Version Management — Track app versions

import React, { useState, useEffect, useCallback } from "react";
import AdminTable, { ActionButton, AdminModal, FormField, FormInput } from "@/components/AdminTable";
import { useToast } from "@/components/Toast";
import { toastError } from "@/app/admin/_utils/toast-error";

interface Version {
  id: number;
  version: string;
  changelog: string;
  download_url: string;
  force_update: number;
  created_at: string;
}

export default function VersionPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Version[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ version: "", changelog: "", download_url: "", force_update: "0" });

  const pageSize = 10;
  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const res = await db.version.list(page, pageSize);
      setData(res.list || []);
      setTotal(res.total || 0);
    } catch (e) {
      toastError(toast, e, "加载版本列表失败");
    }
    setLoading(false);
  }, [db, page, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setForm({ version: "", changelog: "", download_url: "", force_update: "0" });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!db || !form.version) return;
    try {
      await db.version.create({ ...form, force_update: Number(form.force_update) });
      setModalOpen(false);
      fetchData();
    } catch (e) {
      toastError(toast, e, "操作失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!db || !confirm("确定删除？")) return;
    try {
      await db.version.del(id);
      fetchData();
    } catch (e) {
      toastError(toast, e, "删除版本失败");
    }
  };

  const columns = [
    { key: "id", label: "ID", width: "60px" },
    {
      key: "version", label: "版本号",
      render: (v: string) => <span className="font-mono text-sm text-indigo-400">{v}</span>,
    },
    { key: "changelog", label: "更新日志" },
    {
      key: "force_update", label: "强制更新", width: "90px",
      render: (v: number) => (
        <span className={`text-xs ${v ? "text-red-400" : "text-[var(--text-tertiary)]"}`}>
          {v ? "是" : "否"}
        </span>
      ),
    },
    {
      key: "created_at", label: "发布时间", width: "160px",
      render: (v: string) => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    {
      key: "_actions", label: "操作", width: "80px",
      render: (_: any, row: Version) => (
        <ActionButton variant="danger" onClick={() => handleDelete(row.id)}>删除</ActionButton>
      ),
    },
  ];

  return (
    <>
      <AdminTable
        columns={columns} data={data} total={total} page={page} pageSize={pageSize}
        loading={loading} onPageChange={setPage}
        actions={
          <button onClick={openCreate} className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors">
            发布版本
          </button>
        }
      />

      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title="发布新版本">
        <FormField label="版本号" required>
          <FormInput value={form.version} onChange={(v) => setForm({ ...form, version: v })} placeholder="如：1.2.0" />
        </FormField>
        <FormField label="更新日志">
          <textarea
            value={form.changelog}
            onChange={(e) => setForm({ ...form, changelog: e.target.value })}
            rows={4}
            placeholder="本次更新内容..."
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-indigo-500 resize-none"
          />
        </FormField>
        <FormField label="下载地址">
          <FormInput value={form.download_url} onChange={(v) => setForm({ ...form, download_url: v })} placeholder="https://..." />
        </FormField>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">发布</button>
        </div>
      </AdminModal>
    </>
  );
}
