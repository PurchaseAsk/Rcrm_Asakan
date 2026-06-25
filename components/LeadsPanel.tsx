"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Plus, RefreshCcw, Search, Upload, X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Pipeline, Profile, Stage } from "@/types/crm";
import { actorName, MANUAL_SOURCES, pillClass, sourceLabel } from "@/lib/helpers";
import { IconButton } from "@/components/ui/IconButton";
import { LeadTable } from "@/components/LeadTable";

const supabase = createBrowserSupabase();

type CreateDraft = {
  customer_name: string;
  phone: string;
  email: string;
  source: string;
  pipeline_id: string;
  assigned_to: string;
};

const EMPTY_DRAFT: CreateDraft = {
  customer_name: "",
  phone: "",
  email: "",
  source: "",
  pipeline_id: "",
  assigned_to: "",
};

// ── Date helpers ────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type DatePreset = "all" | "today" | "7d" | "30d" | "month";
const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "today", label: "วันนี้" },
  { id: "7d", label: "7 วัน" },
  { id: "30d", label: "30 วัน" },
  { id: "month", label: "เดือนนี้" },
];

// ── CSV helpers ─────────────────────────────────────────────────────────────
function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      result.push(current.trim()); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, "").trim());
  return lines.slice(1)
    .map((line) => {
      const values = parseCSVRow(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v.trim()));
}

function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val !== "") return val.trim();
  }
  return "";
}

// ── Component ───────────────────────────────────────────────────────────────
export function LeadsPanel({
  leads,
  filter,
  setFilter,
  profiles,
  filterableProfiles,
  assigneeFilter,
  setAssigneeFilter,
  onOpenLead,
  reload,
  pipelines,
  stages,
  search,
  setSearch,
}: {
  leads: Lead[];
  filter: "active" | "unfollowed";
  setFilter: (filter: "active" | "unfollowed") => void;
  profiles: Profile[];
  filterableProfiles?: Profile[];
  assigneeFilter?: string;
  setAssigneeFilter?: (id: string) => void;
  onOpenLead: (lead: Lead) => void;
  reload: () => void;
  pipelines: Pipeline[];
  stages: Stage[];
  search: string;
  setSearch: (v: string) => void;
  userRole?: string;
}) {
  const canFilterByMember = !!filterableProfiles?.length && !!setAssigneeFilter;
  const canManage = userRole === "admin" || userRole === "team_lead";

  // ── Create lead modal ────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Date range (for export) ──────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);

  // ── Import modal ─────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [importPipelineId, setImportPipelineId] = useState("");
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; skip: number; err: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Date helpers ─────────────────────────────────────────────────────────
  function setPreset(p: DatePreset) {
    const today = todayStr();
    if (p === "all") { setDateFrom(""); setDateTo(""); }
    else if (p === "today") { setDateFrom(today); setDateTo(today); }
    else if (p === "7d") { setDateFrom(daysAgoStr(6)); setDateTo(today); }
    else if (p === "30d") { setDateFrom(daysAgoStr(29)); setDateTo(today); }
    else if (p === "month") { setDateFrom(monthStartStr()); setDateTo(today); }
  }

  function activePreset(): DatePreset | null {
    const today = todayStr();
    if (!dateFrom && !dateTo) return "all";
    if (dateFrom === today && dateTo === today) return "today";
    if (dateFrom === daysAgoStr(6) && dateTo === today) return "7d";
    if (dateFrom === daysAgoStr(29) && dateTo === today) return "30d";
    if (dateFrom === monthStartStr() && dateTo === today) return "month";
    return null;
  }

  const dateFilteredLeads = useMemo(() => {
    if (!dateFrom && !dateTo) return leads;
    return leads.filter((lead) => {
      const d = new Date(lead.created_at);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [leads, dateFrom, dateTo]);

  // ── Pipeline / stage helpers ──────────────────────────────────────────────
  const firstStageOfPipeline = useMemo(() => {
    if (!draft.pipeline_id) return null;
    const scoped = stages
      .filter((s) => s.pipeline_id === draft.pipeline_id && !s.is_unfollow)
      .sort((a, b) => a.position - b.position);
    if (scoped.length) return scoped[0];
    return stages
      .filter((s) => !s.pipeline_id && !s.is_unfollow)
      .sort((a, b) => a.position - b.position)[0] ?? null;
  }, [draft.pipeline_id, stages]);

  function firstStageOf(pipelineId: string): Stage | null {
    const scoped = stages
      .filter((s) => s.pipeline_id === pipelineId && !s.is_unfollow)
      .sort((a, b) => a.position - b.position);
    if (scoped.length) return scoped[0];
    return stages
      .filter((s) => !s.pipeline_id && !s.is_unfollow)
      .sort((a, b) => a.position - b.position)[0] ?? null;
  }

  function stageName(lead: Lead) {
    return stages.find((s) => s.id === lead.stage_id)?.name ?? "-";
  }
  function pipelineName(lead: Lead) {
    return pipelines.find((p) => p.id === lead.pipeline_id)?.name ?? "-";
  }

  // ── Create lead ───────────────────────────────────────────────────────────
  function openModal() {
    setDraft({ ...EMPTY_DRAFT, pipeline_id: pipelines[0]?.id ?? "" });
    setError("");
    setShowModal(true);
  }

  async function submit() {
    setError("");
    if (!draft.customer_name.trim()) return setError("กรุณากรอกชื่อลูกค้า");
    if (!draft.phone.trim()) return setError("กรุณากรอกเบอร์โทร");
    if (!draft.pipeline_id) return setError("กรุณาเลือก Pipeline");
    if (!draft.source) return setError("กรุณาเลือกแหล่งที่มา");

    setSubmitting(true);
    try {
      if (draft.phone.trim()) {
        const { data: dups } = (await supabase.rpc("find_lead_by_phone", {
          p_phone: draft.phone.trim(),
        })) as { data: { id: string; customer_name: string }[] | null };
        if (dups?.[0]) {
          setError(`มีลีดอยู่แล้ว: ${dups[0].customer_name} (เบอร์ซ้ำ)`);
          return;
        }
      }

      const { error: insErr } = await supabase.from("leads").insert({
        customer_name: draft.customer_name.trim(),
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        source: draft.source,
        pipeline_id: draft.pipeline_id,
        stage_id: firstStageOfPipeline?.id ?? null,
        assigned_to: draft.assigned_to || null,
        status: "active",
        last_activity_at: new Date().toISOString(),
      });

      if (insErr) { setError(insErr.message); return; }

      setShowModal(false);
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = ["ชื่อลูกค้า", "เบอร์โทร", "Email", "แหล่งที่มา", "Pipeline", "Stage", "มอบหมายให้", "วันที่สร้าง"];
    const rows = dateFilteredLeads.map((lead) => [
      lead.customer_name,
      lead.phone ?? "",
      lead.email ?? "",
      sourceLabel(lead.source, lead.metadata),
      pipelineName(lead),
      stageName(lead),
      actorName(lead.assigned_to, profiles),
      new Date(lead.created_at).toLocaleDateString("th-TH"),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import CSV ────────────────────────────────────────────────────────────
  function openImport() {
    setImportPipelineId(pipelines[0]?.id ?? "");
    setImportRows([]);
    setImportResult(null);
    setShowImport(true);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportRows(parseCSV(text));
      setImportResult(null);
    };
    reader.readAsText(file, "utf-8");
  }

  async function runImport() {
    if (!importRows.length || !importPipelineId) return;
    setImporting(true);
    setImportResult(null);
    let ok = 0;
    let skip = 0;
    const errs: string[] = [];
    const stage = firstStageOf(importPipelineId);
    const now = new Date().toISOString();

    for (const row of importRows) {
      const name = getField(row, "ชื่อลูกค้า", "customer_name", "ชื่อ", "name");
      if (!name) { skip++; continue; }

      const phone = getField(row, "เบอร์โทร", "phone", "เบอร์", "phone_number") || null;
      const email = getField(row, "email", "อีเมล") || null;
      const rawSource = getField(row, "แหล่งที่มา", "source").toLowerCase();
      const knownSources = MANUAL_SOURCES.map((s) => s.value);
      const source = knownSources.includes(rawSource) ? rawSource : "other";

      if (phone) {
        const { data: dups } = (await supabase.rpc("find_lead_by_phone", { p_phone: phone })) as {
          data: { id: string }[] | null;
        };
        if (dups?.[0]) { skip++; continue; }
      }

      const { error: insErr } = await supabase.from("leads").insert({
        customer_name: name,
        phone,
        email,
        source,
        pipeline_id: importPipelineId,
        stage_id: stage?.id ?? null,
        status: "active",
        last_activity_at: now,
      });

      if (insErr) { errs.push(`${name}: ${insErr.message}`); }
      else { ok++; }
    }

    setImportResult({ ok, skip, err: errs });
    setImporting(false);
    if (ok > 0) void reload();
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  const field = (label: string, content: React.ReactNode) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {content}
    </div>
  );

  const inp = (
    placeholder: string,
    key: keyof CreateDraft,
    type = "text",
    extra?: Partial<React.InputHTMLAttributes<HTMLInputElement>>,
  ) => (
    <input
      type={type}
      placeholder={placeholder}
      value={draft[key]}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
      {...extra}
    />
  );

  const active = activePreset();
  const hasDateFilter = !!(dateFrom || dateTo);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <Search size={15} className="shrink-0 text-slate-400" />
            <input
              className="min-w-0 flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ เบอร์ เพจ stage..."
            />
            {search && (
              <button onClick={() => setSearch("")} className="shrink-0 text-slate-400 hover:text-slate-700">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canFilterByMember && (
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-brand-600 focus:outline-none"
              value={assigneeFilter ?? ""}
              onChange={(e) => setAssigneeFilter!(e.target.value)}
            >
              <option value="">ทุกคน</option>
              <option value="__pool__">Pool (ไม่มีเจ้าของ)</option>
              {filterableProfiles!.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          )}
          <button className={pillClass(filter === "active")} onClick={() => setFilter("active")}>
            Active
          </button>
          <button className={pillClass(filter === "unfollowed")} onClick={() => setFilter("unfollowed")}>
            Unfollowed
          </button>

          {/* Export / Import — manager+ only */}
          {canManage && (
            <>
              <button
                onClick={() => setShowDateFilter((v) => !v)}
                className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
                  hasDateFilter
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Download size={14} />
                Export
                {hasDateFilter && <span className="text-xs opacity-70">(กรอง)</span>}
              </button>

              <button
                onClick={openImport}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Upload size={14} />
                Import
              </button>
            </>
          )}

          <button
            onClick={openModal}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-900"
          >
            <Plus size={15} />
            สร้างลีด
          </button>
          <IconButton label="Reload" icon={RefreshCcw} onClick={reload} />
        </div>
      </div>

      {/* ── Date range panel (inline expand) ── */}
      {showDateFilter && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <span className="text-xs text-slate-500 shrink-0">ช่วงเวลา:</span>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                active === p.id
                  ? "bg-brand-700 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p.label}
            </button>
          ))}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-brand-600"
          />
          <span className="text-xs text-slate-400">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-brand-600"
          />
          <span className="ml-2 text-xs text-slate-500">{dateFilteredLeads.length} ลีด</span>
          <button
            onClick={exportCSV}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-xs font-medium text-white hover:bg-brand-900"
          >
            <Download size={12} />
            ดาวน์โหลด CSV
          </button>
        </div>
      )}

      <LeadTable leads={dateFilteredLeads} profiles={profiles} onOpenLead={onOpenLead} />

      {/* ── Create Lead Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">สร้างลีดใหม่</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {field("ชื่อลูกค้า *", inp("ชื่อ-นามสกุล", "customer_name"))}

              <div className="grid grid-cols-2 gap-3">
                {field("เบอร์โทร *", inp("0812345678", "phone", "tel", { maxLength: 15 }))}
                {field("Email", inp("email@example.com", "email", "email"))}
              </div>

              {field(
                "แหล่งที่มา *",
                <select
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  value={draft.source}
                  onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                >
                  <option value="">— เลือกแหล่งที่มา —</option>
                  {MANUAL_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>,
              )}

              {field(
                "Pipeline *",
                <>
                  <select
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                    value={draft.pipeline_id}
                    onChange={(e) => setDraft({ ...draft, pipeline_id: e.target.value })}
                  >
                    <option value="">— เลือก Pipeline —</option>
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {firstStageOfPipeline && (
                    <p className="mt-1 text-xs text-slate-400">Stage เริ่มต้น: {firstStageOfPipeline.name}</p>
                  )}
                </>,
              )}

              {field(
                "มอบหมายให้",
                <select
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  value={draft.assigned_to}
                  onChange={(e) => setDraft({ ...draft, assigned_to: e.target.value })}
                >
                  <option value="">— ไม่ระบุ (Pool) —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                  ))}
                </select>,
              )}

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => void submit()}
                disabled={submitting}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-brand-900"
              >
                {submitting ? "กำลังสร้าง…" : "สร้างลีด"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import CSV Modal ── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Import ลีดจาก CSV</h2>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* Format hint */}
              <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1">
                <p className="font-medium text-slate-700">รูปแบบ CSV (row แรกต้องเป็น header):</p>
                <p className="font-mono">ชื่อลูกค้า, เบอร์โทร, Email, แหล่งที่มา</p>
                <p className="text-slate-400">• ชื่อลูกค้า = บังคับ · เบอร์ซ้ำจะถูกข้าม · แหล่งที่มา: website, walk_in, cold_call, referral, event, line, other</p>
              </div>

              {/* File upload */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">ไฟล์ CSV *</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={onFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Upload size={14} />
                    เลือกไฟล์
                  </button>
                  <span className="text-sm text-slate-500">
                    {importRows.length > 0 ? `${importRows.length} แถว` : "ยังไม่ได้เลือกไฟล์"}
                  </span>
                </div>
              </div>

              {/* Pipeline selector */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Pipeline *</label>
                <select
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  value={importPipelineId}
                  onChange={(e) => setImportPipelineId(e.target.value)}
                >
                  <option value="">— เลือก Pipeline —</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {importPipelineId && (() => {
                  const s = firstStageOf(importPipelineId);
                  return s ? <p className="mt-1 text-xs text-slate-400">Stage เริ่มต้น: {s.name}</p> : null;
                })()}
              </div>

              {/* Preview */}
              {importRows.length > 0 && !importResult && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">ตัวอย่าง (5 แถวแรก):</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          {Object.keys(importRows[0]).map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importRows.slice(0, 5).map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="px-3 py-1.5 text-slate-700">{v || "-"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Result */}
              {importResult && (
                <div className={`rounded-lg px-4 py-3 text-sm ${importResult.err.length ? "bg-yellow-50" : "bg-green-50"}`}>
                  <p className="font-medium text-slate-800">
                    นำเข้าสำเร็จ {importResult.ok} ลีด · ข้าม {importResult.skip} (เบอร์ซ้ำหรือไม่มีชื่อ)
                    {importResult.err.length > 0 && ` · Error ${importResult.err.length}`}
                  </p>
                  {importResult.err.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-red-600">
                      {importResult.err.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                onClick={() => setShowImport(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                ปิด
              </button>
              {!importResult && (
                <button
                  onClick={() => void runImport()}
                  disabled={importing || !importRows.length || !importPipelineId}
                  className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-brand-900"
                >
                  {importing ? `กำลัง Import…` : `Import ${importRows.length} ลีด`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
