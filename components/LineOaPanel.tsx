"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { LineOaAccount } from "@/types/crm";
import { deleteRow, toggleBoolean } from "@/lib/helpers";
import { DataTable } from "@/components/ui/DataTable";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { RowActions } from "@/components/ui/RowActions";

const supabase = createBrowserSupabase();

type EditState = { account: LineOaAccount; secret: string; token: string };

export function LineOaPanel({
  accounts,
  reload,
  toast,
}: {
  accounts: LineOaAccount[];
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [form, setForm] = useState({ name: "", channel_id: "", channel_secret: "", channel_access_token: "" });
  const [busy, setBusy] = useState(false);
  const [editModal, setEditModal] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pinModal, setPinModal] = useState<{ account: LineOaAccount } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhook/line` : "/api/webhook/line";

  async function create() {
    if (!form.name.trim() || !form.channel_id.trim()) return toast("Name และ Channel ID จำเป็น");
    setBusy(true);
    try {
      const { error } = await supabase.from("line_oa_accounts").insert({
        name: form.name.trim(),
        channel_id: form.channel_id.trim(),
        channel_secret: form.channel_secret.trim() || null,
        channel_access_token: form.channel_access_token.trim() || null,
        is_active: true,
      });
      if (error) { toast(error.message); return; }
      setForm({ name: "", channel_id: "", channel_secret: "", channel_access_token: "" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function openPin(account: LineOaAccount) {
    setPinModal({ account });
    setPinInput("");
    setPinError(false);
  }

  function submitPin() {
    if (pinInput.trim().toLowerCase() !== "asakan") {
      setPinError(true);
      setPinInput("");
      return;
    }
    if (!pinModal) return;
    const acc = pinModal.account;
    setPinModal(null);
    void (async () => {
      const { data } = await supabase
        .from("line_oa_accounts")
        .select("channel_secret, channel_access_token")
        .eq("id", acc.id)
        .single();
      const row = data as { channel_secret: string | null; channel_access_token: string | null } | null;
      setEditModal({ account: acc, secret: row?.channel_secret ?? "", token: row?.channel_access_token ?? "" });
    })();
  }

  async function saveEdit() {
    if (!editModal) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("line_oa_accounts")
        .update({
          name: editModal.account.name.trim(),
          channel_secret: editModal.secret.trim() || null,
          channel_access_token: editModal.token.trim() || null,
        })
        .eq("id", editModal.account.id);
      if (error) { toast(error.message); return; }
      toast("บันทึกแล้ว");
      setEditModal(null);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast("คัดลอกแล้ว");
  }

  return (
    <Panel title="LINE OA Accounts">
      {/* Webhook URL */}
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
        <span className="shrink-0 font-medium">Webhook URL:</span>
        <code className="flex-1 font-mono">{webhookUrl}</code>
        <button onClick={() => copy(webhookUrl)} className="shrink-0 text-emerald-600 hover:text-emerald-900">
          <Copy size={14} />
        </button>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        ตั้งค่า URL นี้ใน LINE Developers → Messaging API → Webhook URL แล้วเปิด Use webhook
      </p>

      {/* Create form */}
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_100px]">
        <Field label="ชื่อ" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Channel ID" value={form.channel_id} onChange={(v) => setForm({ ...form, channel_id: v })} />
        <Field label="Channel Secret" value={form.channel_secret} onChange={(v) => setForm({ ...form, channel_secret: v })} />
        <Field label="Channel Access Token" value={form.channel_access_token} onChange={(v) => setForm({ ...form, channel_access_token: v })} />
        <div className="flex items-end">
          <button
            className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void create()}
          >
            {busy ? "…" : "เพิ่ม"}
          </button>
        </div>
      </div>

      <DataTable
        headers={["ชื่อ", "Channel ID", "Bot User ID", "สถานะ", "Secret / Token", "Actions"]}
        rows={accounts.map((acc) => [
          acc.name,
          <code key={`cid-${acc.id}`} className="text-xs">{acc.channel_id}</code>,
          <code key={`buid-${acc.id}`} className="text-xs text-slate-400">
            {acc.bot_user_id ? acc.bot_user_id.slice(0, 14) + "…" : "—"}
          </code>,
          acc.is_active
            ? <span key={`s-${acc.id}`} className="text-xs font-medium text-emerald-600">Active</span>
            : <span key={`s-${acc.id}`} className="text-xs text-slate-400">Off</span>,
          <button
            key={`edit-${acc.id}`}
            onClick={() => openPin(acc)}
            className="rounded px-2 py-1 text-xs text-brand-700 underline hover:text-brand-900"
          >
            แก้ไข
          </button>,
          <RowActions
            key={`act-${acc.id}`}
            isActive={acc.is_active}
            onToggle={() => toggleBoolean("line_oa_accounts", acc.id, "is_active", !acc.is_active, reload, toast)}
            onDelete={() => deleteRow("line_oa_accounts", acc.id, reload, toast)}
          />,
        ])}
      />

      {/* PIN modal */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 font-semibold text-slate-950">ยืนยันตัวตน</h3>
            <p className="mb-4 text-sm text-slate-500">
              กรอกรหัสเพื่อแก้ไข Secret / Token ของ{" "}
              <span className="font-medium">{pinModal.account.name}</span>
            </p>
            <input
              autoFocus
              type="password"
              className={`h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-brand-600 ${pinError ? "border-red-400 bg-red-50" : "border-slate-200"}`}
              placeholder="กรอกรหัส"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
            />
            {pinError && <p className="mt-1 text-xs text-red-500">รหัสไม่ถูกต้อง</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setPinModal(null); setPinInput(""); setPinError(false); }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
              >
                ยกเลิก
              </button>
              <button
                onClick={submitPin}
                disabled={!pinInput.trim()}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 font-semibold text-slate-950">แก้ไข: {editModal.account.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">ชื่อ</label>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  value={editModal.account.name}
                  onChange={(e) => setEditModal({ ...editModal, account: { ...editModal.account, name: e.target.value } })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Channel Secret</label>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono outline-none focus:border-brand-600"
                  value={editModal.secret}
                  onChange={(e) => setEditModal({ ...editModal, secret: e.target.value })}
                  placeholder="channel secret…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Channel Access Token</label>
                <textarea
                  className="w-full rounded-lg border border-slate-200 p-3 text-xs font-mono text-slate-800 focus:border-brand-600 focus:outline-none"
                  rows={4}
                  placeholder="channel access token…"
                  value={editModal.token}
                  onChange={(e) => setEditModal({ ...editModal, token: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditModal(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
                ยกเลิก
              </button>
              <button
                onClick={() => void saveEdit()}
                disabled={saving}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
