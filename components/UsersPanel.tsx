"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/types/crm";
import { Copy, KeyRound, RefreshCw, Trash2, UserPlus } from "lucide-react";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
};

type Draft = { email: string; full_name: string; role: Role };

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  team_lead: "Team Lead",
  staff: "Staff",
};

const ROLE_COLOR: Record<Role, string> = {
  admin: "bg-red-100 text-red-700",
  team_lead: "bg-blue-100 text-blue-700",
  staff: "bg-slate-100 text-slate-600",
};

export function UsersPanel({
  accessToken,
  currentUserId,
  onToast,
}: {
  accessToken: string;
  currentUserId: string;
  onToast: (msg: string) => void;
}) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<Draft>({ email: "", full_name: "", role: "staff" });
  const [busy, setBusy] = useState(false);
  const [shownPassword, setShownPassword] = useState<{ label: string; password: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers });
      if (!res.ok) return;
      const json = (await res.json()) as { users: UserRow[] };
      setUsers(json.users ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createUser() {
    if (!draft.email.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify(draft),
      });
      const json = (await res.json()) as { password?: string; error?: string };
      if (!res.ok) { onToast(json.error ?? "เกิดข้อผิดพลาด"); return; }
      setShowCreate(false);
      setDraft({ email: "", full_name: "", role: "staff" });
      setShownPassword({ label: `รหัสผ่านของ ${draft.email}`, password: json.password ?? "" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(user: UserRow) {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ action: "reset_password" }),
    });
    const json = (await res.json()) as { password?: string; error?: string };
    if (!res.ok) { onToast(json.error ?? "เกิดข้อผิดพลาด"); return; }
    setShownPassword({ label: `รหัสผ่านใหม่ของ ${user.email}`, password: json.password ?? "" });
  }

  async function updateRole(userId: string, role: Role) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ action: "update_role", role }),
    });
    if (!res.ok) { onToast("เปลี่ยน role ไม่สำเร็จ"); return; }
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
  }

  async function deleteUser(userId: string) {
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE", headers });
    if (!res.ok) { onToast("ลบ user ไม่สำเร็จ"); return; }
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setConfirmDeleteId(null);
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
    onToast("คัดลอกแล้ว");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">จัดการ Users</h2>
          <p className="text-sm text-slate-500">{users.length} บัญชีในระบบ</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          <UserPlus size={15} />
          สร้าง User ใหม่
        </button>
      </div>

      {/* Password display box */}
      {shownPassword && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="mb-2 text-sm font-medium text-green-800">{shownPassword.label}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border border-green-200 bg-white px-3 py-2 font-mono text-sm tracking-widest text-slate-800">
              {shownPassword.password}
            </code>
            <button
              onClick={() => copyToClipboard(shownPassword.password)}
              className="flex items-center gap-1.5 rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-green-700 hover:bg-green-100"
            >
              <Copy size={13} />
              Copy
            </button>
            <button
              onClick={() => setShownPassword(null)}
              className="rounded-md px-2 py-2 text-sm text-green-600 hover:text-green-800"
            >
              ✕
            </button>
          </div>
          <p className="mt-2 text-xs text-green-700">บันทึกรหัสผ่านนี้ก่อนปิด — จะไม่แสดงอีกครั้ง</p>
        </div>
      )}

      {/* User table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">ชื่อ / Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">สร้างเมื่อ</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        {(user.full_name || user.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{user.full_name || "—"}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.id === currentUserId ? (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[user.role]}`}>
                        {ROLE_LABEL[user.role]}
                      </span>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(e) => void updateRole(user.id, e.target.value as Role)}
                        className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium outline-none ${ROLE_COLOR[user.role]}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="team_lead">Team Lead</option>
                        <option value="staff">Staff</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(user.created_at).toLocaleDateString("th-TH")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => void resetPassword(user)}
                        title="Reset Password"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                      >
                        <KeyRound size={13} />
                      </button>
                      {user.id !== currentUserId && (
                        <button
                          onClick={() => setConfirmDeleteId(user.id)}
                          title="ลบ User"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold text-slate-950">สร้าง User ใหม่</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Email *</label>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  placeholder="user@example.com"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">ชื่อ-นามสกุล</label>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  value={draft.full_name}
                  onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                  placeholder="สมชาย ใจดี"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
                <select
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
                >
                  <option value="staff">Staff</option>
                  <option value="team_lead">Team Lead</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <p className="text-xs text-slate-500">รหัสผ่านจะถูก generate อัตโนมัติ — แสดงให้ admin copy หลังสร้างเสร็จ</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => void createUser()}
                disabled={busy || !draft.email.trim()}
                className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {busy && <RefreshCw size={13} className="animate-spin" />}
                สร้าง User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="px-5 py-5">
              <h3 className="font-semibold text-slate-950">ยืนยันการลบ</h3>
              <p className="mt-1 text-sm text-slate-500">
                {users.find((u) => u.id === confirmDeleteId)?.email}
              </p>
              <p className="mt-2 text-sm text-red-600">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => void deleteUser(confirmDeleteId)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                ลบ User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
