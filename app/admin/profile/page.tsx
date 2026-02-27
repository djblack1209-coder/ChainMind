"use client";

// Personal Profile — View/edit user info + change password

import React, { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { FormField, FormInput, AdminModal } from "@/components/AdminTable";

export default function ProfilePage() {
  const { user, updateUser, changePassword } = useAuthStore();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    nick_name: user?.nick_name || "",
    phone: user?.phone || "",
    email: user?.email || "",
  });

  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdForm, setPwdForm] = useState({ oldPwd: "", newPwd: "", confirmPwd: "" });
  const [pwdError, setPwdError] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const db = typeof window !== "undefined" ? window.electronAPI?.db : null;

  const handleSaveProfile = async () => {
    if (!db || !user) return;
    setSaving(true);
    try {
      await db.user.update(user.id, form);
      updateUser(form);
      setEditing(false);
      setMsg("保存成功");
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) {
      setMsg(e.message || "保存失败");
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    setPwdError("");
    if (!pwdForm.oldPwd || !pwdForm.newPwd) {
      setPwdError("请填写完整");
      return;
    }
    if (pwdForm.newPwd !== pwdForm.confirmPwd) {
      setPwdError("两次密码不一致");
      return;
    }
    if (pwdForm.newPwd.length < 6) {
      setPwdError("密码至少6位");
      return;
    }
    const result = await changePassword(pwdForm.oldPwd, pwdForm.newPwd);
    if (result.ok) {
      setPwdOpen(false);
      setPwdForm({ oldPwd: "", newPwd: "", confirmPwd: "" });
      setMsg("密码修改成功");
      setTimeout(() => setMsg(""), 2000);
    } else {
      setPwdError(result.error || "修改失败");
    }
  };

  if (!user) {
    return <div className="text-[var(--text-tertiary)] text-sm">未登录</div>;
  }

  return (
    <div className="max-w-2xl">
      {/* Success message */}
      {msg && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          {msg}
        </div>
      )}

      {/* Avatar + basic info */}
      <div className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
            {(user.nick_name || user.username).charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{user.nick_name || user.username}</h2>
            <p className="text-sm text-[var(--text-tertiary)]">@{user.username}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">UUID: {user.uuid}</p>
          </div>
        </div>

        {editing ? (
          <div className="space-y-0">
            <FormField label="昵称">
              <FormInput value={form.nick_name} onChange={(v) => setForm({ ...form, nick_name: v })} placeholder="昵称" />
            </FormField>
            <FormField label="手机">
              <FormInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="手机号" />
            </FormField>
            <FormField label="邮箱">
              <FormInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="邮箱" />
            </FormField>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSaveProfile} disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors">
                {saving ? "保存中..." : "保存"}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center text-sm">
              <span className="w-20 text-[var(--text-tertiary)]">昵称</span>
              <span className="text-[var(--text-secondary)]">{user.nick_name || "-"}</span>
            </div>
            <div className="flex items-center text-sm">
              <span className="w-20 text-[var(--text-tertiary)]">手机</span>
              <span className="text-[var(--text-secondary)]">{user.phone || "-"}</span>
            </div>
            <div className="flex items-center text-sm">
              <span className="w-20 text-[var(--text-tertiary)]">邮箱</span>
              <span className="text-[var(--text-secondary)]">{user.email || "-"}</span>
            </div>
            <div className="flex items-center text-sm">
              <span className="w-20 text-[var(--text-tertiary)]">角色ID</span>
              <span className="text-[var(--text-secondary)]">{user.authority_id}</span>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setForm({ nick_name: user.nick_name || "", phone: user.phone || "", email: user.email || "" });
                  setEditing(true);
                }}
                className="px-4 py-2 rounded-lg text-sm bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
              >
                编辑资料
              </button>
           <button
                onClick={() => setPwdOpen(true)}
                className="px-4 py-2 rounded-lg text-sm bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                修改密码
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Change password modal */}
      <AdminModal open={pwdOpen} onClose={() => setPwdOpen(false)} title="修改密码" width="max-w-sm">
        <FormField label="当前密码" required>
          <FormInput value={pwdForm.oldPwd} onChange={(v) => setPwdForm({ ...pwdForm, oldPwd: v })} type="password" placeholder="当前密码" />
        </FormField>
        <FormField label="新密码" required>
          <FormInput value={pwdForm.newPwd} onChange={(v) => setPwdForm({ ...pwdForm, newPwd: v })} type="password" placeholder="新密码（至少6位）" />
        </FormField>
        <FormField label="确认密码" required>
          <FormInput value={pwdForm.confirmPwd} onChange={(v) => setPwdForm({ ...pwdForm, confirmPwd: v })} type="password" placeholder="再次输入新密码" />
        </FormField>
        {pwdError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {pwdError}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setPwdOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">取消</button>
          <button onClick={handleChangePassword} className="px-4 py-2 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600">确定</button>
        </div>
      </AdminModal>
    </div>
  );
}
