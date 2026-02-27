"use client";

// Reusable admin data table with pagination, search, and actions
// Used across all admin CRUD pages

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

  const handleSearch = () => {
    onSearch?.(keyword);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {onSearch && (
            <>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={searchPlaceholder}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-indigo-500 w-56"
              />
              <button
                onClick={handleSearch}
                className="px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-400 text-sm hover:bg-indigo-500/25 transition-colors"
              >
                搜索
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--border-secondary)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-secondary)]">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider"
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-secondary)]">
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-[var(--text-tertiary)]">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      加载中...
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-[var(--text-tertiary)]">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr
                    key={row[rowKey] ?? idx}
                    className="bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-[var(--text-secondary)]">
                        {col.render
                          ? col.render(row[col.key], row, idx)
                          : (row[col.key] ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
        <span>
          共 {total} 条，第 {page}/{totalPages} 页
        </span>
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-2.5 py-1 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  p === page
                    ? "bg-indigo-500/20 text-indigo-400"
                    : "bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                {p}
              </button>
            );
          })}
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-2.5 py-1 rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

// Reusable action buttons
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
    default: "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
    primary: "text-indigo-400 hover:bg-indigo-500/15",
    danger: "text-red-400 hover:bg-red-500/10",
    success: "text-emerald-400 hover:bg-emerald-500/10",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 rounded-md text-xs transition-colors disabled:opacity-40 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

// Reusable modal dialog
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative ${width} w-full mx-4 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-2xl shadow-2xl`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-secondary)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

// Form field wrapper
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
    <div className="mb-4">
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// Standard text input
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
      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-indigo-500 disabled:opacity-50"
    />
  );
}

// Standard select
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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// Status badge
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
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        active
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${active ? "bg-emerald-400" : "bg-red-400"}`} />
      {active ? activeText : inactiveText}
    </span>
  );
}
