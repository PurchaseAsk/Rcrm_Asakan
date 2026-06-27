"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Pipeline, Profile, Stage } from "@/types/crm";

const supabase = createBrowserSupabase();

export function VoucherModal({
  lead,
  stage,
  pipeline,
  salesProfile,
  userId,
  actorName,
  onSuccess,
  onClose,
}: {
  lead: Lead;
  stage: Stage;
  pipeline: Pipeline | null;
  salesProfile: Profile | null;
  userId: string;
  actorName: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const salesSuffix = salesProfile?.sales_suffix ?? null;
  const canSubmit = customerName.trim() && phone.trim() && salesSuffix && pipeline?.gas_webhook_url && pipeline?.gas_project_key;

  async function submit() {
    if (!canSubmit || !pipeline) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/voucher/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: pipeline.gas_webhook_url,
          projectKey: pipeline.gas_project_key,
          customerName: customerName.trim(),
          phone: phone.trim(),
          salesSuffix: salesSuffix,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "ส่งคำขอไม่สำเร็จ");
        return;
      }

      // Update lead stage
      await supabase
        .from("leads")
        .update({
          stage_id: stage.id,
          status: stage.is_unfollow ? "unfollowed" : "active",
          last_activity_at: new Date().toISOString(),
          stage_entered_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        stage_id: stage.id,
        type: "stage_change",
        content: `${actorName} ส่งขอออกคูปองให้ ${customerName.trim()} (${phone.trim()}) ผ่าน ${stage.name}`,
        created_by: userId,
      });

      onSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="font-semibold text-slate-950">🎟️ ออกคูปอง</h3>
            <p className="mt-0.5 text-xs text-slate-500">ส่งขออนุมัติผ่าน Telegram → GAS</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Validation warnings */}
          {!pipeline?.gas_webhook_url && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Pipeline ยังไม่ได้ตั้งค่า GAS Webhook URL
            </div>
          )}
          {!salesSuffix && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {salesProfile
                ? `${salesProfile.full_name ?? salesProfile.email} ยังไม่มี Sales Code — ให้ Admin ตั้งค่าก่อน`
                : "ไม่พบข้อมูล Sales ที่รับผิดชอบลีดนี้"}
            </div>
          )}

          {/* Customer name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">ชื่อลูกค้า *</label>
            <input
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
              placeholder="ชื่อ-นามสกุลลูกค้า"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoFocus
              disabled={busy}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">เบอร์โทร *</label>
            <input
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
              placeholder="08xxxxxxxx"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              disabled={busy}
            />
          </div>

          {/* Sales info (read-only) */}
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-xs text-slate-500">Sales</p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-sm font-medium text-slate-800">
                {salesProfile?.full_name ?? salesProfile?.email ?? "(ไม่มีผู้รับผิดชอบ)"}
              </span>
              {salesSuffix && (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700 tracking-widest">
                  {salesSuffix}
                </span>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => void submit()}
            disabled={!canSubmit || busy}
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {busy ? "กำลังส่ง…" : "ส่งขออนุมัติ"}
          </button>
        </div>
      </div>
    </div>
  );
}
