"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Filter, Plus, RefreshCcw, Search, Upload, X } from "lucide-react";
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
  userRole,
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

  // ── Filter bar ───────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // ── Import modal ─────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [importPipelineId, setImportPipelineId] = useState("");
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importResult, setImportResult] = useState<{ ok: number; skip: number; updated: number; err: string[] } | null>(null);
  const [unmatchedStages, setUnmatchedStages] = useState<string[]>([]);
  const [stageMapping, setStageMapping] = useState<Record<string, string>>({});
  const [updateExistingStage, setUpdateExistingStage] = useState(false);
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
    let result = leads;
    if (dateFrom || dateTo) {
      result = result.filter((lead) => {
        const d = new Date(lead.created_at);
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
        return true;
      });
    }
    if (sourceFilter) {
      result = result.filter((lead) => lead.source === sourceFilter);
    }
    return result;
  }, [leads, dateFrom, dateTo, sourceFilter]);

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
    if (!/^\d{10}$/.test(draft.phone.trim())) return setError("เบอร์โทรต้องเป็นตัวเลข 10 หลัก");
    if (!draft.pipeline_id) return setError("กรุณาเลือก Pipeline");
    if (!draft.source) return setError("กรุณาเลือกแหล่งที่มา");

    setSubmitting(true);
    try {
      if (draft.phone.trim()) {
        const { data: dups } = (await supabase.rpc("find_lead_by_phone", {
          p_phone: draft.phone.trim(),
          p_pipeline_id: draft.pipeline_id || null,
        })) as { data: { id: string; customer_name: string }[] | null };
        if (dups?.[0]) {
          setError(`เบอร์นี้มีลีดอยู่แล้วใน pipeline นี้: ${dups[0].customer_name}`);
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
        stage_entered_at: firstStageOfPipeline?.id ? new Date().toISOString() : null,
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
    const header = ["ชื่อลูกค้า", "เบอร์โทร", "Email", "LineID", "แหล่งที่มา", "Pipeline", "Stage", "มอบหมายให้", "วันที่สร้าง"];
    const rows = dateFilteredLeads.map((lead) => [
      lead.customer_name,
      lead.phone ?? "",
      lead.email ?? "",
      lead.line_id ?? "",
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
    setImportProgress("");
    setUnmatchedStages([]);
    setStageMapping({});
    setUpdateExistingStage(false);
    setShowImport(true);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setImportRows(rows);
      setImportResult(null);
      // Detect stage names in CSV that don't match any CRM stage
      const csvStageNames = new Set<string>();
      for (const row of rows) {
        const s = getField(row, "stage", "ขั้นตอน").toLowerCase().trim();
        if (s) csvStageNames.add(s);
      }
      const unmatched = [...csvStageNames].filter(
        (s) => !stages.some((st) => st.name.toLowerCase() === s),
      );
      setUnmatchedStages(unmatched);
      setStageMapping({});
    };
    reader.readAsText(file, "utf-8");
  }

  async function runImport() {
    if (!importRows.length) return;
    setImporting(true);
    setImportResult(null);
    const now = new Date().toISOString();
    const knownSources = MANUAL_SOURCES.map((s) => s.value);
    const pipelineMap = new Map(pipelines.map((p) => [p.name.toLowerCase(), p.id]));
    const profileMap = new Map(
      profiles.map((p) => [(p.full_name ?? p.email ?? "").toLowerCase(), p.id]),
    );

    // Step 1: parse all rows synchronously
    type InsertRow = {
      customer_name: string; phone: string | null; email: string | null;
      line_id: string | null; source: string; pipeline_id: string;
      stage_id: string | null; stage_entered_at: string | null;
      assigned_to: string | null; status: "active"; last_activity_at: string;
    };
    type Candidate = InsertRow & { note: string | null };
    const candidates: Candidate[] = [];
    let skipNoName = 0;

    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user.id ?? null;

    for (const row of importRows) {
      const name = getField(row, "ชื่อลูกค้า", "customer_name", "ชื่อ", "name");
      if (!name) { skipNoName++; continue; }

      const phone = getField(row, "เบอร์โทร", "phone", "เบอร์", "phone_number") || null;
      const email = getField(row, "email", "อีเมล") || null;
      const lineId = getField(row, "lineid", "line_id", "LineID", "line id") || null;
      const note = getField(row, "note", "หมายเหตุ", "notes", "โน้ต") || null;
      const rawSource = getField(row, "แหล่งที่มา", "source").toLowerCase();
      const source = knownSources.includes(rawSource) ? rawSource : "other";

      const csvPipeline = getField(row, "pipeline").toLowerCase();
      const resolvedPipelineId = (csvPipeline && pipelineMap.get(csvPipeline)) || importPipelineId || "";
      if (!resolvedPipelineId) { skipNoName++; continue; }

      const csvStage = getField(row, "stage", "ขั้นตอน").toLowerCase();
      let resolvedStageId: string | null = null;
      if (csvStage) {
        if (stageMapping[csvStage]) {
          resolvedStageId = stageMapping[csvStage];
        } else {
          const matched =
            stages.find((s) => s.name.toLowerCase() === csvStage && s.pipeline_id === resolvedPipelineId) ??
            stages.find((s) => s.name.toLowerCase() === csvStage && !s.pipeline_id);
          resolvedStageId = matched?.id ?? null;
        }
      }
      if (!resolvedStageId) resolvedStageId = firstStageOf(resolvedPipelineId)?.id ?? null;

      const csvAssignee = getField(row, "มอบหมายให้", "assigned_to", "sales").toLowerCase();
      const resolvedAssignedTo = (csvAssignee && profileMap.get(csvAssignee)) || null;

      candidates.push({
        customer_name: name, phone, email, line_id: lineId, source,
        pipeline_id: resolvedPipelineId, stage_id: resolvedStageId,
        stage_entered_at: resolvedStageId ? now : null,
        assigned_to: resolvedAssignedTo, status: "active", last_activity_at: now,
        note,
      });
    }

    // normalize phone the same way as the DB function normalize_phone()
    const normPhone = (p: string | null): string | null => {
      if (!p) return null;
      const d = p.replace(/\D/g, "");
      if (!d.length) return null;
      if (d.length === 11 && d.startsWith("66")) return "0" + d.slice(2);
      return d;
    };

    // Step 2: fetch ALL existing leads with pagination (Supabase caps at 1000/page)
    setImportProgress("กำลังดึงข้อมูลลีดเดิม…");
    const existingMap = new Map<string, string>(); // "normPhone|pipeline_id" → lead_id
    const pipelineIds = [...new Set(candidates.map((c) => c.pipeline_id))];
    if (pipelineIds.length > 0) {
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data: existing } = await supabase
          .from("leads").select("id, phone, pipeline_id")
          .in("pipeline_id", pipelineIds)
          .not("phone", "is", null)
          .range(from, from + PAGE - 1);
        if (!existing?.length) break;
        existing.forEach((r) => {
          const norm = normPhone(r.phone as string);
          if (norm) existingMap.set(`${norm}|${r.pipeline_id}`, r.id as string);
        });
        if (existing.length < PAGE) break;
        from += PAGE;
      }
    }

    // Step 3: separate into new inserts vs existing-lead updates
    type UpdateRow = { lead_id: string; stage_id: string | null };
    const toInsert: Candidate[] = [];
    const toUpdate: UpdateRow[] = [];
    for (const c of candidates) {
      if (!c.phone) { toInsert.push(c); continue; }
      const norm = normPhone(c.phone);
      const key = `${norm}|${c.pipeline_id}`;
      if (norm && existingMap.has(key)) {
        if (updateExistingStage) toUpdate.push({ lead_id: existingMap.get(key)!, stage_id: c.stage_id });
        // else skip duplicate silently
      } else {
        toInsert.push(c);
      }
    }

    // Step 4: batch insert in chunks of 500
    setImportProgress(`กำลัง insert ${toInsert.length} ลีดใหม่…`);
    let ok = 0;
    const errs: string[] = [];
    const CHUNK = 500;

    async function insertActivities(ids: { id: string }[], chunkRows: Candidate[]) {
      const acts = ids
        .map((ins, idx) => {
          const n = chunkRows[idx]?.note;
          if (!n) return null;
          return { lead_id: ins.id, type: "note", content: n, stage_id: chunkRows[idx]?.stage_id ?? null, created_by: currentUserId };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (acts.length > 0) await supabase.from("lead_activities").insert(acts);
    }

    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const leadPayload = chunk.map(({ note: _n, ...rest }) => rest);
      const { data: inserted, error: insErr } = await supabase
        .from("leads").insert(leadPayload).select("id");
      if (!insErr && inserted) {
        ok += inserted.length;
        await insertActivities(inserted, chunk);
      } else if (insErr?.code === "23505") {
        // Fallback: insert row-by-row, skip actual duplicates silently
        for (const row of chunk) {
          const { note: _n, ...leadRow } = row;
          const { data: one, error: oneErr } = await supabase.from("leads").insert(leadRow).select("id");
          if (!oneErr && one) { ok += one.length; await insertActivities(one, [row]); }
          else if (oneErr?.code !== "23505") errs.push(`${row.customer_name}: ${oneErr?.message}`);
        }
      } else if (insErr) {
        errs.push(insErr.message);
      }
    }

    // Step 5: batch update stage for existing leads
    if (toUpdate.length > 0) setImportProgress(`กำลัง update stage ${toUpdate.length} ลีด…`);
    let updatedCount = 0;
    if (toUpdate.length > 0) {
      const byStage = new Map<string, string[]>();
      for (const u of toUpdate) {
        const key = u.stage_id ?? "__null__";
        if (!byStage.has(key)) byStage.set(key, []);
        byStage.get(key)!.push(u.lead_id);
      }
      for (const [sid, ids] of byStage) {
        const stageId = sid === "__null__" ? null : sid;
        const CHUNK_UP = 500;
        for (let i = 0; i < ids.length; i += CHUNK_UP) {
          await supabase.from("leads")
            .update({ stage_id: stageId, stage_entered_at: stageId ? now : null })
            .in("id", ids.slice(i, i + CHUNK_UP));
        }
        updatedCount += ids.length;
      }
    }

    const skippedDups = candidates.length - toInsert.length - toUpdate.length;
    const totalSkip = skipNoName + skippedDups + (toInsert.length - ok);
    setImportProgress("");
    setImportResult({ ok, updated: updatedCount, skip: totalSkip, err: errs });
    setImporting(false);
    if (ok > 0 || updatedCount > 0) void reload();
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
  const activeFilterCount = [!!(dateFrom || dateTo), !!sourceFilter].filter(Boolean).length;

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

          {/* Filter button */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`relative inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
              activeFilterCount > 0
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Filter size={14} />
            กรอง
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-700 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Export / Import — manager+ only */}
          {canManage && (
            <>
              <button
                onClick={exportCSV}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download size={14} />
                Export
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

      {/* ── Filter bar ── */}
      {showFilters && (
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 space-y-2.5">
          {/* Date filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 text-xs font-medium text-slate-500">วันที่สร้าง</span>
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
          </div>

          {/* Source filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 text-xs font-medium text-slate-500">แหล่งที่มา</span>
            {[
              { value: "", label: "ทั้งหมด" },
              { value: "facebook", label: "Facebook" },
              { value: "chat", label: "Chat" },
              { value: "line", label: "Line" },
              { value: "website", label: "Website" },
              { value: "walk_in", label: "Walk-in" },
              { value: "cold_call", label: "Cold Call" },
              { value: "referral", label: "Referral" },
              { value: "event", label: "Event" },
              { value: "other", label: "อื่นๆ" },
            ].map((s) => (
              <button
                key={s.value}
                onClick={() => setSourceFilter(s.value)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  sourceFilter === s.value
                    ? "bg-brand-700 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Result count + clear */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{dateFilteredLeads.length} ลีดที่กรอง</span>
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); setSourceFilter(""); }}
                className="text-xs text-rose-500 hover:text-rose-700"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
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
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Pipeline <span className="font-normal text-slate-400">(fallback ถ้าไม่มีใน CSV)</span>
                </label>
                <select
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  value={importPipelineId}
                  onChange={(e) => setImportPipelineId(e.target.value)}
                >
                  <option value="">— ใช้ pipeline จาก CSV —</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {importPipelineId && (() => {
                  const s = firstStageOf(importPipelineId);
                  return s ? <p className="mt-1 text-xs text-slate-400">Stage เริ่มต้น: {s.name}</p> : null;
                })()}
              </div>

              {/* Stage mapping for unrecognized stage names */}
              {importRows.length > 0 && unmatchedStages.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
                  <p className="text-xs font-medium text-amber-800">
                    Stage ต่อไปนี้ไม่พบใน CRM — เลือก stage ปลายทาง:
                  </p>
                  {unmatchedStages.map((csvStage) => (
                    <div key={csvStage} className="flex items-center gap-2">
                      <span className="w-36 shrink-0 rounded border border-amber-200 bg-white px-2 py-1 font-mono text-xs text-amber-700">
                        {csvStage}
                      </span>
                      <span className="text-xs text-slate-400">→</span>
                      <select
                        className="h-8 flex-1 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-brand-600"
                        value={stageMapping[csvStage] ?? ""}
                        onChange={(e) =>
                          setStageMapping((prev) => ({ ...prev, [csvStage]: e.target.value }))
                        }
                      >
                        <option value="">— ข้าม (ใช้ stage แรก) —</option>
                        {stages
                          .filter((s) => !s.is_unfollow)
                          .map((s) => {
                            const pl = pipelines.find((p) => p.id === s.pipeline_id);
                            return (
                              <option key={s.id} value={s.id}>
                                {s.name}{pl ? ` (${pl.name})` : " (global)"}
                              </option>
                            );
                          })}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Update existing stage option */}
              {importRows.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={updateExistingStage}
                    onChange={(e) => setUpdateExistingStage(e.target.checked)}
                    className="rounded"
                  />
                  อัปเดต stage ของลีดที่มีอยู่แล้ว (เบอร์+pipeline ซ้ำ) ด้วย
                </label>
              )}

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
                    นำเข้าสำเร็จ {importResult.ok} ลีด
                    {importResult.updated > 0 && ` · อัปเดต stage ${importResult.updated} ลีด`}
                    {` · ข้าม ${importResult.skip}`}
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
                <div className="flex items-center gap-3">
                  {importing && importProgress && (
                    <span className="text-xs text-slate-500 animate-pulse">{importProgress}</span>
                  )}
                  <button
                    onClick={() => void runImport()}
                    disabled={importing || !importRows.length}
                    className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-brand-900"
                  >
                    {importing ? "กำลัง Import…" : `Import ${importRows.length} ลีด`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
