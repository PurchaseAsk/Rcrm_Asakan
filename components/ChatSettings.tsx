"use client";

import { useEffect, useRef, useState } from "react";
import { Settings, X, Upload, Trash2, Save } from "lucide-react";
import type { Page } from "@/types/crm";
import { createBrowserSupabase } from "@/lib/supabase";

async function authHeaders() {
  const { data: { session } } = await createBrowserSupabase().auth.getSession();
  if (!session) throw new Error("กรุณาเข้าสู่ระบบใหม่");
  return { Authorization: `Bearer ${session.access_token}` };
}

type AutoReplySetting = {
  id?: string;
  page_id: string;
  is_active: boolean;
  greeting_text: string;
  image_url: string | null;
  trigger_new_conv: boolean;
  trigger_from_ad: boolean;
  trigger_returning_days: number | null;
};

function emptySettings(pageId: string): AutoReplySetting {
  return {
    page_id: pageId,
    is_active: true,
    greeting_text: "",
    image_url: null,
    trigger_new_conv: true,
    trigger_from_ad: true,
    trigger_returning_days: null,
  };
}

export function ChatSettings({
  pages,
  userId,
  userRole,
  toast,
  onClose,
}: {
  pages: Page[];
  userId: string;
  userRole: string;
  toast: (msg: string) => void;
  onClose: () => void;
}) {
  const [selectedPageId, setSelectedPageId] = useState<string>(pages[0]?.id ?? "");
  const [setting, setSetting] = useState<AutoReplySetting | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRevision = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canEdit = userRole === "admin" || userRole === "team_lead";

  useEffect(() => {
    if (!selectedPageId) return;
    let cancelled = false;
    setLoading(true);

    const load = (attempt: number) =>
      fetch(`/api/chat-settings?page_id=${selectedPageId}`, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ data: AutoReplySetting | null }>;
        })
        .then((res) => {
          if (!cancelled) setSetting(res.data ? { ...res.data, greeting_text: res.data.greeting_text ?? "" } : emptySettings(selectedPageId));
        })
        .catch(() => {
          if (cancelled) return;
          if (attempt < 2) {
            setTimeout(() => load(attempt + 1), 800);
          } else {
            setSetting(emptySettings(selectedPageId));
          }
        })
        .finally(() => { if (!cancelled) setLoading(false); });

    void load(0);
    return () => { cancelled = true; };
  }, [selectedPageId]);

  useEffect(() => {
    previewRevision.current += 1;
    setPreviewUrl(null);
    setPreviewLoading(false);
    return () => { previewRevision.current += 1; };
  }, [selectedPageId, setting?.greeting_text, setting?.image_url]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function handlePreview() {
    if (!setting?.greeting_text.trim() || !setting.image_url) return;
    const revision = previewRevision.current;
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/chat-settings/preview", {
        method: "POST",
        headers: { ...await authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ greeting_text: setting.greeting_text, image_url: setting.image_url }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "สร้างภาพตัวอย่างไม่สำเร็จ");
      const url = URL.createObjectURL(await res.blob());
      if (revision === previewRevision.current) setPreviewUrl(url);
      else URL.revokeObjectURL(url);
    } catch (error) {
      if (revision === previewRevision.current) toast(error instanceof Error ? error.message : "สร้างภาพตัวอย่างไม่สำเร็จ");
    } finally {
      if (revision === previewRevision.current) setPreviewLoading(false);
    }
  }

  function patch(updates: Partial<AutoReplySetting>) {
    setSetting((prev) => prev ? { ...prev, ...updates } : null);
  }

  async function handleSave() {
    if (!setting || !canEdit || loading || uploading) return;
    setSaving(true);
    try {
      const res = await fetch("/api/chat-settings", {
        method: "POST",
        headers: { ...await authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ...setting, created_by: userId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "บันทึกไม่สำเร็จ");
      toast("บันทึกการตั้งค่าแล้ว ✓");
    } catch (error) {
      toast(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(file: File) {
    if (!selectedPageId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("page_id", selectedPageId);
      const res = await fetch("/api/chat-settings/upload-image", { method: "POST", headers: await authHeaders(), body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
      patch({ image_url: json.url });
      toast("อัปโหลดรูปภาพแล้ว ✓");
    } catch (e) {
      toast(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  const selectedPage = pages.find((p) => p.id === selectedPageId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40" onClick={onClose}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-slate-600" />
            <span className="font-semibold text-slate-800">ตั้งค่า Auto-Reply</span>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Page selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">เพจ Facebook</label>
            <select
              value={selectedPageId}
              disabled={saving || uploading}
              onChange={(e) => setSelectedPageId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด...</div>
          ) : setting ? (
            <>
              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">เปิดใช้งาน Auto-Reply</div>
                  <div className="text-xs text-slate-500">ส่งข้อความทักทายอัตโนมัติเมื่อลูกค้าทักมา</div>
                </div>
                <button
                  disabled={!canEdit}
                  onClick={() => patch({ is_active: !setting.is_active })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${setting.is_active ? "bg-blue-500" : "bg-slate-300"} ${!canEdit ? "opacity-50" : ""}`}
                >
                  <span
                    className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: setting.is_active ? "translateX(20px)" : "translateX(0)" }}
                  />
                </button>
              </div>

              {/* Trigger conditions */}
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">เงื่อนไขการส่ง</div>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={setting.trigger_new_conv}
                      onChange={(e) => patch({ trigger_new_conv: e.target.checked })}
                      className="h-4 w-4 rounded accent-blue-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-800">ลูกค้าทักครั้งแรก / กลับมาทักใหม่</div>
                      <div className="text-xs text-slate-500">Conversation ใหม่ที่สร้างขึ้นจาก Messenger</div>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={setting.trigger_from_ad}
                      onChange={(e) => patch({ trigger_from_ad: e.target.checked })}
                      className="h-4 w-4 rounded accent-blue-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-800">มาจากโฆษณา (Click-to-Messenger)</div>
                      <div className="text-xs text-slate-500">Webhook มี referral ad_id — คลิกปุ่ม Message จากโฆษณา</div>
                    </div>
                  </label>

                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={setting.trigger_returning_days !== null}
                      onChange={(e) => patch({ trigger_returning_days: e.target.checked ? 30 : null })}
                      className="h-4 w-4 rounded accent-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">กลับมาทักหลังหายไปนาน</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        ไม่มีกิจกรรมนานกว่า
                        <input
                          type="number"
                          min={1}
                          max={365}
                          disabled={setting.trigger_returning_days === null || !canEdit}
                          value={setting.trigger_returning_days ?? 30}
                          onChange={(e) => patch({ trigger_returning_days: parseInt(e.target.value) || 30 })}
                          className="w-16 rounded border border-slate-300 px-2 py-0.5 text-center text-xs disabled:opacity-40"
                        />
                        วัน
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Greeting text */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">ข้อความทักทาย</label>
                <textarea
                  rows={4}
                  disabled={!canEdit}
                  value={setting.greeting_text}
                  onChange={(e) => patch({ greeting_text: e.target.value })}
                  placeholder={`สวัสดีครับ/ค่ะ ขอบคุณที่ติดต่อ ${selectedPage?.name ?? "เรา"} นะครับ/ค่ะ 😊\nมีอะไรให้ช่วยเหลือได้เลยครับ/ค่ะ`}
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                />
                <p className="mt-1 text-right text-xs text-slate-400">{setting.greeting_text.length} ตัวอักษร</p>
                {setting.image_url && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    ข้อความทั้งหมดจะอยู่ด้านบน รูปคูปองอยู่ด้านล่าง ส่งเป็นภาพเดียว ลูกค้ากดขยายได้ แต่คัดลอกข้อความในภาพไม่ได้
                  </p>
                )}
              </div>
              {canEdit && setting.image_url && setting.greeting_text.trim() && (
                <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <button type="button" onClick={() => void handlePreview()} disabled={previewLoading || uploading || saving}
                    className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 disabled:opacity-50">
                    {previewLoading ? "กำลังสร้างภาพตัวอย่าง..." : "ดูภาพรวมก่อนบันทึก"}
                  </button>
                  {previewUrl && (
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="block" aria-label="ขยายภาพตัวอย่าง Auto-Reply">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt="ภาพ Auto-Reply: ข้อความทั้งหมดพร้อมคูปอง" className="mx-auto w-full max-w-[360px] rounded-2xl" />
                    </a>
                  )}
                </div>
              )}

              {/* Image */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">รูปภาพประกอบ (ไม่บังคับ)</label>
                {setting.image_url ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={setting.image_url}
                      alt="greeting"
                      className="h-40 w-auto rounded-xl border border-slate-200 object-cover"
                    />
                    {canEdit && (
                      <button
                        onClick={() => patch({ image_url: null })}
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImageUpload(f); }}
                    />
                    <button
                      disabled={!canEdit || uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-6 text-sm text-slate-500 transition hover:border-blue-400 hover:text-blue-500 disabled:opacity-50"
                    >
                      <Upload size={16} />
                      {uploading ? "กำลังอัปโหลด..." : "คลิกเพื่ออัปโหลดรูปภาพ (สูงสุด 5 MB)"}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        {canEdit && setting && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              ยกเลิก
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving || uploading || loading}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
            >
              <Save size={14} />
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
