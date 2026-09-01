"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Trash2, RefreshCcw, Globe, Check, Pencil, X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Pipeline, Stage, Profile, Page } from "@/types/crm";

const supabase = createBrowserSupabase();

type WebsiteLeadRule = {
  id: string;
  project_slug: string;
  pipeline_id: string | null;
  stage_id: string | null;
  assigned_to: string | null;
  facebook_page_id: string | null;
  is_active: boolean;
  created_at: string;
};

export function WebsiteSettingsTab({ pipelines, stages, profiles, pages }: {
  pipelines: Pipeline[];
  stages: Stage[];
  profiles: Profile[];
  pages: Page[];
}) {
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [rules, setRules] = useState<WebsiteLeadRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState({
    project_slug: "",
    pipeline_id: "",
    stage_id: "",
    assigned_to: "",
    facebook_page_id: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ pipeline_id: "", stage_id: "", assigned_to: "", facebook_page_id: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: settingsData }, { data: rulesData }] = await Promise.all([
      supabase.from("website_settings").select("webhook_secret").single(),
      supabase.from("website_lead_rules").select("*").order("created_at", { ascending: true }),
    ]);
    if (settingsData) setSecret(settingsData.webhook_secret as string);
    setRules((rulesData ?? []) as WebsiteLeadRule[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function rotateSecret() {
    if (!confirm("เปลี่ยน secret ใหม่? Website จะต้องอัปเดต key ใหม่ด้วย")) return;
    const newSecret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await supabase.from("website_settings").update({ webhook_secret: newSecret }).neq("id", "");
    setSecret(newSecret);
  }

  function copySecret() {
    void navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function addRule() {
    if (!newRule.project_slug.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from("website_lead_rules")
      .insert({
        project_slug: newRule.project_slug.trim(),
        pipeline_id: newRule.pipeline_id || null,
        stage_id: newRule.stage_id || null,
        assigned_to: newRule.assigned_to || null,
        facebook_page_id: newRule.facebook_page_id || null,
      })
      .select()
      .single();
    if (data) {
      setRules((prev) => [...prev, data as WebsiteLeadRule]);
      setNewRule({ project_slug: "", pipeline_id: "", stage_id: "", assigned_to: "", facebook_page_id: "" });
    }
    setSaving(false);
  }

  async function toggleRule(id: string, isActive: boolean) {
    await supabase.from("website_lead_rules").update({ is_active: !isActive }).eq("id", id);
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, is_active: !isActive } : r));
  }

  function startEdit(r: WebsiteLeadRule) {
    setEditingId(r.id);
    setEditValues({
      pipeline_id: r.pipeline_id ?? "",
      stage_id: r.stage_id ?? "",
      assigned_to: r.assigned_to ?? "",
      facebook_page_id: r.facebook_page_id ?? "",
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    await supabase.from("website_lead_rules").update({
      pipeline_id: editValues.pipeline_id || null,
      stage_id: editValues.stage_id || null,
      assigned_to: editValues.assigned_to || null,
      facebook_page_id: editValues.facebook_page_id || null,
    }).eq("id", editingId);
    setRules((prev) => prev.map((r) => r.id === editingId ? {
      ...r,
      pipeline_id: editValues.pipeline_id || null,
      stage_id: editValues.stage_id || null,
      assigned_to: editValues.assigned_to || null,
      facebook_page_id: editValues.facebook_page_id || null,
    } : r));
    setEditingId(null);
    setSaving(false);
  }

  async function deleteRule(id: string) {
    if (!confirm("ลบกฎนี้?")) return;
    await supabase.from("website_lead_rules").delete().eq("id", id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  const endpointUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/leads/from-website`
    : "/api/leads/from-website";

  function stagesForPipeline(pipelineId: string) {
    const scoped = stages.filter((s) => s.pipeline_id === pipelineId);
    return scoped.length ? scoped : stages.filter((s) => s.pipeline_id === null);
  }

  if (loading) return <p className="text-sm text-slate-400">กำลังโหลด…</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Globe size={20} className="text-brand-600" />
        <h2 className="text-lg font-semibold text-slate-950">ตั้งค่าลีดจากเว็บไซต์</h2>
        <button
          onClick={() => void load()}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500 hover:bg-slate-50"
        >
          <RefreshCcw size={13} />
          รีเฟรช
        </button>
      </div>

      {/* Webhook Endpoint */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Endpoint URL</h3>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <code className="flex-1 truncate text-xs text-slate-600">{endpointUrl}</code>
          <button
            onClick={() => { void navigator.clipboard.writeText(endpointUrl); }}
            className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700"
            title="Copy URL"
          >
            <Copy size={14} />
          </button>
        </div>

        <h3 className="text-sm font-semibold text-slate-700 pt-2">Secret Key</h3>
        <p className="text-xs text-slate-500">ใส่ key นี้ใน Website ฟิลด์ <code className="rounded bg-slate-100 px-1">secret</code> เพื่อยืนยันตัวตน</p>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <code className="flex-1 truncate text-xs text-slate-600 select-all">{secret}</code>
          <button
            onClick={copySecret}
            className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700"
            title="Copy secret"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          </button>
        </div>
        <button
          onClick={() => void rotateSecret()}
          className="text-xs text-rose-500 hover:underline"
        >
          สร้าง secret ใหม่ (ระวัง: Website จะต้องอัปเดตด้วย)
        </button>
      </section>

      {/* Project Mapping Rules */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">กฎ Mapping โปรเจกต์ → Pipeline</h3>
        <p className="text-xs text-slate-500">เมื่อ Website ส่ง <code className="rounded bg-slate-100 px-1">project_slug</code> มา ระบบจะใส่ลีดเข้า Pipeline + ขั้นตอน + ผู้รับผิดชอบที่กำหนดไว้</p>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Project Slug</th>
                <th className="px-4 py-2.5 text-left">Pipeline</th>
                <th className="px-4 py-2.5 text-left">ขั้นตอนเริ่มต้น</th>
                <th className="px-4 py-2.5 text-left">ผู้รับ</th>
                <th className="px-4 py-2.5 text-left">เพจ (แจก)</th>
                <th className="px-4 py-2.5 text-center">เปิด</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                    ยังไม่มีกฎ — เพิ่มกฎด้านล่าง
                  </td>
                </tr>
              )}
              {rules.map((r) => {
                const pipeline = pipelines.find((p) => p.id === r.pipeline_id);
                const stage = stages.find((s) => s.id === r.stage_id);
                const profile = profiles.find((p) => p.id === r.assigned_to);
                const page = pages.find((p) => p.id === r.facebook_page_id);
                const isEditing = editingId === r.id;
                const editPipelineId = isEditing ? editValues.pipeline_id : r.pipeline_id ?? "";
                return (
                  <tr key={r.id} className={`${r.is_active ? "" : "opacity-40"} ${isEditing ? "bg-blue-50/40" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs">{r.project_slug}</td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select
                          className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-600"
                          value={editValues.pipeline_id}
                          onChange={(e) => setEditValues((p) => ({ ...p, pipeline_id: e.target.value, stage_id: "" }))}
                        >
                          <option value="">— ไม่ระบุ —</option>
                          {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : <span className="text-slate-700">{pipeline?.name ?? <span className="text-slate-300">—</span>}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select
                          className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-600 disabled:opacity-40"
                          value={editValues.stage_id}
                          disabled={!editPipelineId}
                          onChange={(e) => setEditValues((p) => ({ ...p, stage_id: e.target.value }))}
                        >
                          <option value="">— ไม่ระบุ —</option>
                          {stagesForPipeline(editPipelineId).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      ) : <span className="text-slate-700">{stage?.name ?? <span className="text-slate-300">—</span>}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select
                          className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-600"
                          value={editValues.assigned_to}
                          onChange={(e) => setEditValues((p) => ({ ...p, assigned_to: e.target.value }))}
                        >
                          <option value="">— กองกลาง —</option>
                          {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
                        </select>
                      ) : <span className="text-slate-700">{profile?.full_name ?? profile?.email ?? <span className="text-slate-300">—</span>}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select
                          className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-600"
                          value={editValues.facebook_page_id}
                          onChange={(e) => setEditValues((p) => ({ ...p, facebook_page_id: e.target.value }))}
                        >
                          <option value="">— ไม่ระบุ —</option>
                          {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : (
                        page ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{page.name}</span>
                        ) : <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => void toggleRule(r.id, r.is_active)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${r.is_active ? "bg-emerald-500" : "bg-slate-200"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${r.is_active ? "translate-x-4" : "translate-x-1"}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => void saveEdit()}
                              disabled={saving}
                              className="rounded bg-brand-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                            >
                              บันทึก
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded p-1 text-slate-400 hover:text-slate-600"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(r)}
                              className="rounded p-1 text-slate-300 hover:text-brand-600"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => void deleteRule(r.id)}
                              className="rounded p-1 text-slate-300 hover:text-rose-500"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Add new rule row */}
              <tr className="bg-slate-50">
                <td className="px-3 py-2">
                  <input
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-mono outline-none focus:border-brand-600"
                    placeholder="เช่น asakan-korat"
                    value={newRule.project_slug}
                    onChange={(e) => setNewRule((p) => ({ ...p, project_slug: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") void addRule(); }}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-600"
                    value={newRule.pipeline_id}
                    onChange={(e) => setNewRule((p) => ({ ...p, pipeline_id: e.target.value, stage_id: "" }))}
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-600 disabled:opacity-40"
                    value={newRule.stage_id}
                    disabled={!newRule.pipeline_id}
                    onChange={(e) => setNewRule((p) => ({ ...p, stage_id: e.target.value }))}
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {stagesForPipeline(newRule.pipeline_id).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-600"
                    value={newRule.assigned_to}
                    onChange={(e) => setNewRule((p) => ({ ...p, assigned_to: e.target.value }))}
                  >
                    <option value="">— กองกลาง —</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-600"
                    value={newRule.facebook_page_id}
                    onChange={(e) => setNewRule((p) => ({ ...p, facebook_page_id: e.target.value }))}
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2">
                  <button
                    onClick={() => void addRule()}
                    disabled={!newRule.project_slug.trim() || saving}
                    className="flex h-8 items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white disabled:opacity-40"
                  >
                    <Plus size={13} />
                    เพิ่ม
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Payload reference */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">ตัวอย่าง JSON Payload (Website → CRM)</h3>
        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600 leading-relaxed">{`POST ${endpointUrl}
Content-Type: application/json

{
  "secret": "<your-secret>",
  "project_slug": "asakan-korat",
  "name": "สมชาย ใจดี",
  "phone": "0812345678",
  "email": "user@example.com",
  "message": "สนใจโครงการอยู่แถวโคราช",
  "appointment_date": "2026-06-25",
  "source_url": "https://example.com/korat"
}`}</pre>
      </section>
    </div>
  );
}
