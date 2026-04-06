"use client";

import React, { useState } from "react";

interface Column<T = any> {
  key: string;
  label: string;
  width?: string;
  render?: (value: any, row: T, index: number) => React.ReactNode;
}

interface AdminTableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onSearch?: (keyword: string) => void;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
  rowKey?: string;
  emptyText?: string;
}

export default function AdminTable<T extends Record<string, any>>({
  columns,
  data,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange: _onPageSizeChange,
  onSearch,
  searchPlaceholder = "搜索...",
  actions,
  rowKey = "id",
  emptyText = "暂无数据",
}: AdminTableProps<T>) {
  const [keyword, setKeyword] = useState("");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showToolbar = Boolean(onSearch || actions);

  const handleSearch = () => {
    onSearch?.(keyword);
  };

  return (
    <div className="space-y-4">
      {showToolbar && (
        <div className="panel-shell rounded-[28px] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              {onSearch && (
                <>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder={searchPlaceholder}
                    className="input w-64 text-sm"
                  />
                  <button onClick={handleSearch} className="btn btn-secondary px-4 py-2 text-sm">
                    搜索
                  </button>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,20,30,0.96),rgba(8,11,18,0.98))] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/[0.03]">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]"
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-14 text-center">
                    <div className="inline-flex items-center gap-3 rounded-full border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-tertiary)]">
                      <div className="h-4 w-4 rounded-full border-2 border-[var(--brand-primary)] border-t-transparent animate-spin" />
                      加载中...
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-14 text-center text-sm text-[var(--text-tertiary)]">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr key={row[rowKey] ?? idx} className="border-b border-white/6 transition hover:bg-white/[0.03] last:border-b-0">
                    {columns.map((col) => (
                      <td key={col.key} className="px-5 py-4 text-[var(--text-secondary)] align-middle">
                        {col.render ? col.render(row[col.key], row, idx) : (row[col.key] ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-shell flex flex-col gap-3 rounded-[24px] px-4 py-4 text-xs text-[var(--text-tertiary)] sm:flex-row sm:items-center sm:justify-between">
        <span>
          共 {total} 条，第 {page}/{totalPages} 页
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="btn btn-secondary px-3 py-2 text-xs disabled:opacity-30"
          >
            上一页
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 5) {
              p = i + 1;
            } else if (page <= 3) {
              p = i + 1;
            } else if (page >= totalPages - 2) {
              p = totalPages - 4 + i;
            } else {
              p = page - 2 + i;
            }
            return (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`rounded-2xl px-3 py-2 text-xs transition ${
                  p === page
                    ? "border border-[var(--border-primary)] bg-[var(--brand-primary-soft)] text-[#ffc4b1]"
                    : "border border-white/8 bg-white/[0.03] text-[var(--text-secondary)] hover:bg-white/[0.06]"
                }`}
              >
                {p}
              </button>
            );
          })}
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="btn btn-secondary px-3 py-2 text-xs disabled:opacity-30"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActionButton({
  onClick,
  variant = "default",
  children,
  disabled,
}: {
  onClick: () => void;
  variant?: "default" | "primary" | "danger" | "success";
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const styles = {
    default: "btn-secondary text-[var(--text-secondary)]",
    primary: "border border-[var(--border-primary)] bg-[var(--brand-primary-soft)] text-[#ffc4b1] hover:bg-[rgba(255,115,77,0.14)]",
    danger: "border border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.08)] text-[#ffbeca] hover:bg-[rgba(251,113,133,0.12)]",
    success: "border border-[rgba(74,222,128,0.18)] bg-[rgba(74,222,128,0.08)] text-emerald-200 hover:bg-[rgba(74,222,128,0.12)]",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl px-3 py-2 text-xs font-medium transition disabled:opacity-40 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function AdminModal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className={`relative ${width} mx-4 w-full overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,20,30,0.96),rgba(8,11,18,0.98))] shadow-[var(--shadow-lg)]`}>
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
          <div>
            <div className="section-kicker">Modal</div>
            <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">{title}</h3>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon border border-white/8 bg-white/[0.03]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label className="meta-label mb-2 block">
        {label}
        {required && <span className="ml-1 text-rose-300">*</span>}
      </label>
      {children}
    </div>
  );
}

export function FormInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="input disabled:opacity-50"
    />
  );
}

export function FormSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string | number;
  onChange: (v: string) => void;
  options: { label: string; value: string | number }[];
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function StatusBadge({
  active,
  activeText = "启用",
  inactiveText = "禁用",
}: {
  active: boolean;
  activeText?: string;
  inactiveText?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
      active
        ? "border border-[rgba(74,222,128,0.18)] bg-[rgba(74,222,128,0.08)] text-emerald-200"
        : "border border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.08)] text-[#ffbeca]"
    }`}>
      <span className={`mr-2 h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-300" : "bg-rose-300"}`} />
      {active ? activeText : inactiveText}
    </span>
  );
}
