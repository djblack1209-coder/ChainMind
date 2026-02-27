"use client";

// User Management Page — CRUD table with role assignment

import React, { useState, useEffect, useCallback } from "react";
import AdminTable, {
  ActionButton,
  AdminModal,
  FormField,
  FormInput,
  FormSelect,
  StatusBadge,
} from "@/components/AdminTable";
import { useToast } from "@/components/Toast";

interface User {
  id: number;
  uuid: string;
  username: string;
  nick_name: string;
  phone: string;
  email: string;
  enable: number;
  authority_id: number;
  header_img: string;
  created_at: string;
}

interface Authority {
  authority_id: number;
  authority_name: string;
}

export default function UserPage() {
  const { toast } = useToast();
  const [data, setData] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ username: "", nick_name: "", password: "", phone: "", email: "", authority_id: "888", enable: "1" });
  const [authorities, setAuthorities] = useState<Authority[]>([]);

  // Reset password modal
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState(0);
  const [newPassword, setNewPassword] = useState("");

  const pageSize = 10;
  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const fetchData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const res = await db.user.list(page, pageSize, keyword);
      setData(res.list || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      toast("error", e?.message || "加载用户列表失败");
    }
    setLoading(false);
  }, [db, page, keyword, toast]);

  const fetchAuthorities = useCallback(async () => {
    if (!db) return;
    try {
      const list = await db.authority.list();
      setAuthorities(list || []);
    } catch (e: any) {
      toast("error", e?.message || "加载角色列表失败");
    }
  }, [db, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchAuthorities(); }, [fetchAuthorities]);

  const openCreate = () => {
    setEditing(null);
    setForm({ username: "", nick_name: "", password: "", phone: "", email: "", authority_id: "888", enable: "1" });
    setModalOpen(true);
  };

  const openEdit = (row: User) => {
    setEditing(row);
    setForm({
      username: row.username,
      nick_name: row.nick_name || "",
      password: "",
      phone: row.phone || "",
      email: row.email || "",
      authority_id: String(row.authority_id),
      enable: String(row.enable),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!db) return;
    try {
      if (editing) {
        await db.user.update(editing.id, {
          nick_name: form.nick_name,
          phone: form.phone,
          email: form.email,
          authority_id: Number(form.authority_id),
          enable: Number(form.enable),
        });
      } else {
        if (!form.username || !form.password) return;
        await db.user.create({
          username: form.username,
          password: form.password,
          nick_name: form.nick_name,
          phone: form.phone,
          email: form.email,
          authority_id: Number(form.authority_id),
          enable: Number(form.enable),
        });
      }
      setModalOpen(false);
      fetchData();
    } catch (e: any) {
      toast("error", e.message || "操作失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!db || !confirm("确定删除该用户？")) return;
    try {
      await db.user.del(id);
      fetchData();
    } catch (e: any) {
      toast("error", e?.message || "删除用户失败");
    }
  };

  const handleResetPassword = async () => {
    if (!db || !newPassword) return;
    try {
      await db.user.resetPassword(resetUserId, newPassword);
      setResetOpen(false);
      setNewPassword("");
    } catch (e: any) {
      toast("error", e?.message || "重置密码失败");
    }
  };

  const authorityName = (id: number) =>
    authorities.find((a) => a.authority_id === id)?.authority_name || String(id);

  const columns = [
    { key: "id", label: "ID", width: "60px" },
    { key: "username", label: "用户名" },
    { key: "nick_name", label: "昵称", render: (v: string) => v || "-" },
    {
      key: "authority_id",
      label: "角色",
      render: (v: number) => (
        <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-500/15 text-indigo-400">
          {authorityName(v)}
        </span>
      ),
    },
    { key: "phone", label: "手机", render: (v: string) => v || "-" },
    { key: "email", label: "邮箱", render: (v: string) => v || "-" },
    {
      key: "enable",
      label: "状态",
      width: "80px",
      render: (v: number) => <StatusBadge active={v === 1} />,
    },
    {
      key: "_actions",
      label: "操作",
      width: "180px",
      render: (_: any, row: User) => (
        <div className="flex items-center gap-1">
          <ActionButton variant="primary" onClick={() => openEdit(row)}>编辑</ActionButton>
          <ActionButton variant="default" onClick={() => { setResetUserId(row.id); setResetOpen(true); }}>重置密码</ActionButton>
          <ActionButton variant="danger" onClick={() => handleDelete(row.id)}>删除</ActionButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <AdminTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        onPageChange={setPage}
        onSearch={setKeyword}
        searchPlaceholder="搜索用户名/昵称..."
        actions={
          <button onClick={openCreate} className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors">
            新增用户
          </button>
        }
      />

      {/* Create/Edit Modal */}
      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑用户" : "新增用户"}>
        {!editing && (
          <FormField label="用户名" required>
            <FormInput value={form.username} onChange={(v) => setForm({ ...form, username: v })} placeholder="请输入用户名" />
          </FormField>
        )}
        {!editing && (
          <FormField label="密码" required>
            <FormInput value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="请输入密码" type="password" />
          </FormField>
        )}
        <FormField label="昵称">
          <FormInput value={form.nick_name} onChange={(v) => setForm({ ...form, nick_name: v })} placeholder="请输入昵称" />
        </FormField>
        <FormField label="手机">
          <FormInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="请输入手机号" />
        </FormField>
        <FormField label="邮箱">
          <FormInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="请输入邮箱" />
        </FormField>
        <FormField label="角色">
          <FormSelect
            value={form.authority_id}
            onChange={(v) => setForm({ ...form, authority_id: v })}
            options={authorities.map((a) => ({ label: a.authority_name, value: String(a.authority_id) }))}
          />
        </FormField>
        <FormField label="状态">
          <FormSelect
            value={form.enable}
            onChange={(v) => setForm({ ...form, enable: v })}
            options={[{ label: "启用", value: "1" }, { label: "禁用", value: "0" }]}
          />
        </FormField>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
            取消
          </button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600 transition-colors">
            保存
          </button>
        </div>
      </AdminModal>

      {/* Reset Password Modal */}
      <AdminModal open={resetOpen} onClose={() => setResetOpen(false)} title="重置密码" width="max-w-sm">
        <FormField label="新密码" required>
          <FormInput value={newPassword} onChange={setNewPassword} placeholder="请输入新密码" type="password" />
        </FormField>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setResetOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleResetPassword} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">确定</button>
        </div>
      </AdminModal>
    </>
  );
}
