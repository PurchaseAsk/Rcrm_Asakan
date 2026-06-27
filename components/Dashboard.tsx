"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Profile, Stage } from "@/types/crm";
import { sourceLabel } from "@/lib/helpers";

const supabase = createBrowserSupabase();

type DashTab = "pipeline" | "conversions" | "chat";

const CHART_COLORS = [
  "#ef4444", "#3b82f6", "#10b981", "#f59e0b",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

function isoDay(s: string) {
  return s.slice(0, 10);
}

function todayStr() {
  return isoDay(new Date().toISOString());
}

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function buildDayRange(from: string, to: string): string[] {
  const days: string[] = [];
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    days.push(isoDay(d.toISOString()));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// ─── Quick date range presets ─────────────────────────────────────────────────
type Preset = { label: string; from: string; to: string };

function buildPresets(): Preset[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fmt = (d: Date) => isoDay(d.toISOString());
  const today = fmt(now);
  const dow = (now.getDay() + 6) % 7;
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(weekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart); lastWeekEnd.setDate(weekStart.getDate() - 1);
  const m3 = new Date(y, m - 2, 1);
  const m6 = new Date(y, m - 5, 1);
  return [
    { label: "สัปดาห์นี้",       from: fmt(weekStart),    to: today },
    { label: "สัปดาห์ที่แล้ว",   from: fmt(lastWeekStart), to: fmt(lastWeekEnd) },
    { label: "เดือนนี้",          from: `${y}-${String(m + 1).padStart(2, "0")}-01`, to: today },
    { label: "เดือนที่แล้ว",      from: `${y}-${String(m).padStart(2, "0")}-01`,   to: fmt(new Date(y, m, 0)) },
    { label: "3 เดือนที่ผ่านมา", from: fmt(m3), to: today },
    { label: "6 เดือนที่ผ่านมา", from: fmt(m6), to: today },
  ];
}

// ─── Date range picker (shared) ───────────────────────────────────────────────
function DateRangePicker({
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  suffix,
}: {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  suffix?: React.ReactNode;
}) {
  const presets = useMemo(() => buildPresets(), []);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = p.from === dateFrom && p.to === dateTo;
          return (
            <button
              key={p.label}
              onClick={() => { setDateFrom(p.from); setDateTo(p.to); }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-brand-700 text-white"
                  : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          จาก
          <input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-brand-600"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          ถึง
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={todayStr()}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-brand-600"
          />
        </label>
        {suffix}
      </div>
    </div>
  );
}

// ─── Simple SVG line chart ────────────────────────────────────────────────────
function LineChart({
  days,
  series,
}: {
  days: string[];
  series: { name: string; color: string; values: number[] }[];
}) {
  const W = 700, H = 180, pL = 32, pB = 28, pT = 8, pR = 10;
  const cW = W - pL - pR;
  const cH = H - pT - pB;
  const maxVal = Math.max(...series.flatMap((s) => s.values), 1);
  const n = days.length;
  const px = (i: number) => pL + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
  const py = (v: number) => pT + (1 - v / maxVal) * cH;
  const labelStep = Math.max(1, Math.ceil(n / 10));
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={pL} y1={pT + t * cH} x2={W - pR} y2={pT + t * cH} stroke="#e2e8f0" strokeWidth={1} />
          <text x={pL - 4} y={pT + t * cH + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
            {Math.round((1 - t) * maxVal)}
          </text>
        </g>
      ))}
      {series.map((s) => {
        const pts = days.map((_, i) => `${px(i)},${py(s.values[i])}`).join(" ");
        return (
          <g key={s.name}>
            {n > 1 && (
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinejoin="round" />
            )}
            {days.map((_, i) =>
              s.values[i] > 0 ? (
                <circle key={i} cx={px(i)} cy={py(s.values[i])} r={2.5} fill={s.color} />
              ) : null,
            )}
          </g>
        );
      })}
      {days.map((d, i) => {
        if (i % labelStep !== 0 && i !== n - 1) return null;
        return (
          <text key={d} x={px(i)} y={H - 5} textAnchor="middle" fontSize={9} fill="#94a3b8">
            {d.slice(5)}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Dashboard 1: Pipeline table ─────────────────────────────────────────────
function PipelineTable({
  leads,
  stages,
  profileById,
}: {
  leads: Lead[];
  stages: Stage[];
  profileById: Map<string, Profile>;
}) {
  const [sortKey, setSortKey] = useState<string>("__total__");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const activeLeads = useMemo(() => leads.filter((l) => l.status !== "unfollowed"), [leads]);

  const { matrix, stageTotals, grandTotal } = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    const st: Record<string, number> = {};
    let grand = 0;
    activeLeads.forEach((lead) => {
      const uid = lead.assigned_to ?? "__pool__";
      if (!m.has(uid)) m.set(uid, new Map());
      const sid = lead.stage_id ?? "__none__";
      const sm = m.get(uid)!;
      sm.set(sid, (sm.get(sid) ?? 0) + 1);
      st[sid] = (st[sid] ?? 0) + 1;
      grand++;
    });
    return { matrix: m, stageTotals: st, grandTotal: grand };
  }, [activeLeads]);

  const { unfollowedByUser, unfollowedTotal } = useMemo(() => {
    const m = new Map<string, number>();
    leads.filter((l) => l.status === "unfollowed").forEach((lead) => {
      const uid = lead.assigned_to ?? "__pool__";
      m.set(uid, (m.get(uid) ?? 0) + 1);
    });
    return { unfollowedByUser: m, unfollowedTotal: leads.filter((l) => l.status === "unfollowed").length };
  }, [leads]);

  const rows = useMemo(() => {
    const r = [...matrix.entries()].map(([uid, sm]) => ({
      uid,
      name:
        uid === "__pool__"
          ? "(ไม่มีผู้ดูแล)"
          : (profileById.get(uid)?.full_name ?? profileById.get(uid)?.email ?? uid.slice(0, 8)),
      sm,
      total: [...sm.values()].reduce((a, b) => a + b, 0),
    }));
    r.sort((a, b) => {
      const av = sortKey === "__total__" ? a.total : (a.sm.get(sortKey) ?? 0);
      const bv = sortKey === "__total__" ? b.total : (b.sm.get(sortKey) ?? 0);
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return r;
  }, [matrix, profileById, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sortIcon = (key: string) =>
    sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  if (!stages.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
        ไม่มี stage ใน pipeline นี้
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 bg-blue-50/60">
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 w-48"></th>
            {stages.map((s) => (
              <th key={s.id} className="px-3 py-3 text-center">
                <span className="text-xl font-bold text-brand-700">{stageTotals[s.id] ?? 0}</span>
              </th>
            ))}
            <th className="px-3 py-3 text-center">
              <span className="text-xl font-bold text-rose-500">{unfollowedTotal}</span>
            </th>
            <th className="px-3 py-3 text-center">
              <span className="text-xl font-bold text-slate-700">{grandTotal}</span>
            </th>
          </tr>
          <tr className="border-b border-slate-200">
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">ผู้ใช้</th>
            {stages.map((s) => (
              <th
                key={s.id}
                className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 cursor-pointer select-none whitespace-nowrap hover:text-slate-900"
                onClick={() => toggleSort(s.id)}
              >
                {s.name}{sortIcon(s.id)}
              </th>
            ))}
            <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-rose-400 whitespace-nowrap">
              เลิกติดตาม
            </th>
            <th
              className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 cursor-pointer select-none hover:text-slate-900"
              onClick={() => toggleSort("__total__")}
            >
              รวม{sortIcon("__total__")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.uid}
              className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${i % 2 === 1 ? "bg-slate-50/40" : ""}`}
            >
              <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
              {stages.map((s) => {
                const v = row.sm.get(s.id) ?? 0;
                return (
                  <td key={s.id} className="px-3 py-3 text-center tabular-nums">
                    {v > 0 ? <span className="font-semibold text-brand-700">{v}</span> : <span className="text-slate-300">-</span>}
                  </td>
                );
              })}
              <td className="px-3 py-3 text-center tabular-nums">
                {(unfollowedByUser.get(row.uid) ?? 0) > 0
                  ? <span className="font-semibold text-rose-500">{unfollowedByUser.get(row.uid)}</span>
                  : <span className="text-slate-300">-</span>}
              </td>
              <td className="px-3 py-3 text-center font-semibold tabular-nums text-slate-800">{row.total}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={stages.length + 3} className="py-12 text-center text-sm text-slate-400">ไม่มีลีด</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Dashboard 2: Lead Conversions ───────────────────────────────────────────
function ConversionsView({
  leads,
  stages,
  profileById,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
}: {
  leads: Lead[];
  stages: Stage[];
  profileById: Map<string, Profile>;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
}) {
  const filteredLeads = useMemo(
    () => leads.filter((l) => isoDay(l.created_at) >= dateFrom && isoDay(l.created_at) <= dateTo),
    [leads, dateFrom, dateTo],
  );

  // Historical stage entries: leadId → set of stageIds the lead has ever entered
  const [stagesByLead, setStagesByLead] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    const ids = filteredLeads.map((l) => l.id);
    if (ids.length === 0) {
      setStagesByLead(new Map());
      return;
    }
    let cancelled = false;
    supabase
      .from("lead_activities")
      .select("lead_id, stage_id")
      .eq("type", "stage_change")
      .not("stage_id", "is", null)
      .in("lead_id", ids)
      .then(({ data }) => {
        if (cancelled) return;
        const m = new Map<string, Set<string>>();
        (data ?? []).forEach((row: { lead_id: string; stage_id: string }) => {
          if (!m.has(row.lead_id)) m.set(row.lead_id, new Set());
          m.get(row.lead_id)!.add(row.stage_id);
        });
        setStagesByLead(m);
      });
    return () => { cancelled = true; };
  }, [filteredLeads]);

  const { days, series } = useMemo(() => {
    const dayList = buildDayRange(dateFrom, dateTo);
    const totalPerDay: Record<string, number> = {};
    dayList.forEach((d) => { totalPerDay[d] = 0; });
    filteredLeads.forEach((lead) => {
      const day = isoDay(lead.created_at);
      if (day in totalPerDay) totalPerDay[day]++;
    });
    const stageEntriesPerDay: Record<string, Record<string, Set<string>>> = {};
    // Count distinct leads that entered each stage, bucketed by lead creation day
    stagesByLead.forEach((stageSet, leadId) => {
      const lead = filteredLeads.find((l) => l.id === leadId);
      if (!lead) return;
      const day = isoDay(lead.created_at);
      if (!(day in totalPerDay)) return;
      stageSet.forEach((sid) => {
        stageEntriesPerDay[sid] ??= {};
        stageEntriesPerDay[sid][day] ??= new Set();
        stageEntriesPerDay[sid][day].add(leadId);
      });
    });
    const s = [
      { name: "ลีดใหม่ (รวม)", color: CHART_COLORS[0], values: dayList.map((d) => totalPerDay[d]) },
      ...stages.slice(0, 7).map((st, i) => ({
        name: st.name,
        color: CHART_COLORS[i + 1] ?? "#94a3b8",
        values: dayList.map((d) => stageEntriesPerDay[st.id]?.[d]?.size ?? 0),
      })),
    ];
    return { days: dayList, series: s };
  }, [filteredLeads, dateFrom, dateTo, stages, stagesByLead]);

  const { matrix, stageTotals, totalUnfollowed } = useMemo(() => {
    const m = new Map<string, { total: number; stages: Map<string, number>; unfollowed: number }>();
    filteredLeads.forEach((lead) => {
      const uid = lead.assigned_to ?? "__pool__";
      if (!m.has(uid)) m.set(uid, { total: 0, stages: new Map(), unfollowed: 0 });
      const row = m.get(uid)!;
      row.total++;
      const hist = stagesByLead.get(lead.id);
      const sids = hist && hist.size > 0 ? [...hist] : [lead.stage_id ?? "__none__"];
      sids.forEach((sid) => row.stages.set(sid, (row.stages.get(sid) ?? 0) + 1));
      if (lead.status === "unfollowed") row.unfollowed++;
    });
    const rows = [...m.entries()]
      .map(([uid, data]) => ({
        uid,
        name:
          uid === "__pool__"
            ? "(ไม่มีผู้ดูแล)"
            : (profileById.get(uid)?.full_name ?? profileById.get(uid)?.email ?? uid.slice(0, 8)),
        total: data.total,
        stages: data.stages,
        unfollowed: data.unfollowed,
      }))
      .sort((a, b) => b.total - a.total);
    const st: Record<string, number> = {};
    filteredLeads.forEach((l) => {
      const hist = stagesByLead.get(l.id);
      const sids = hist && hist.size > 0 ? [...hist] : [l.stage_id ?? "__none__"];
      sids.forEach((sid) => { st[sid] = (st[sid] ?? 0) + 1; });
    });
    const uf = filteredLeads.filter((l) => l.status === "unfollowed").length;
    return { matrix: rows, stageTotals: st, totalUnfollowed: uf };
  }, [filteredLeads, profileById, stagesByLead]);

  const { sourceMatrix, sourceStageTotals } = useMemo(() => {
    const m = new Map<string, { total: number; stages: Map<string, number>; unfollowed: number }>();
    filteredLeads.forEach((lead) => {
      const key = sourceLabel(lead.source, lead.metadata);
      if (!m.has(key)) m.set(key, { total: 0, stages: new Map(), unfollowed: 0 });
      const row = m.get(key)!;
      row.total++;
      const hist = stagesByLead.get(lead.id);
      const sids = hist && hist.size > 0 ? [...hist] : [lead.stage_id ?? "__none__"];
      sids.forEach((sid) => row.stages.set(sid, (row.stages.get(sid) ?? 0) + 1));
      if (lead.status === "unfollowed") row.unfollowed++;
    });
    const rows = [...m.entries()]
      .map(([src, data]) => ({ src, total: data.total, stages: data.stages, unfollowed: data.unfollowed }))
      .sort((a, b) => b.total - a.total);
    const st: Record<string, number> = {};
    filteredLeads.forEach((l) => {
      const hist = stagesByLead.get(l.id);
      const sids = hist && hist.size > 0 ? [...hist] : [l.stage_id ?? "__none__"];
      sids.forEach((sid) => { st[sid] = (st[sid] ?? 0) + 1; });
    });
    return { sourceMatrix: rows, sourceStageTotals: st };
  }, [filteredLeads, stagesByLead]);

  return (
    <div className="space-y-4">
      <DateRangePicker
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        suffix={<span className="text-sm text-slate-500">· ลีดใหม่ {filteredLeads.length} ราย</span>}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-4">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="inline-block h-2.5 w-6 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
        <LineChart days={days} series={series} />
      </div>

      {/* By user */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-800">Lead Conversions แบ่งตามผู้ใช้งาน</h3>
          <p className="mt-0.5 text-xs text-slate-500">{dateFrom} — {dateTo}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 w-48">ผู้ใช้</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">ลีดใหม่</th>
              {stages.slice(1).map((s) => (
                <th key={s.id} className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                  {s.name}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-rose-400 whitespace-nowrap">
                เลิกติดตาม
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={row.uid} className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${i % 2 === 1 ? "bg-slate-50/40" : ""}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                <td className="px-3 py-3 text-center font-bold tabular-nums text-brand-700">{row.total}</td>
                {stages.slice(1).map((s) => {
                  const v = row.stages.get(s.id) ?? 0;
                  return (
                    <td key={s.id} className="px-3 py-3 text-center tabular-nums">
                      {v > 0 ? <span className="font-medium text-slate-700">{v}</span> : <span className="text-slate-300">-</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center tabular-nums">
                  {row.unfollowed > 0 ? <span className="font-medium text-rose-500">{row.unfollowed}</span> : <span className="text-slate-300">-</span>}
                </td>
              </tr>
            ))}
            {matrix.length > 0 && (
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-3 text-slate-700">รวม</td>
                <td className="px-3 py-3 text-center tabular-nums text-brand-700">{filteredLeads.length}</td>
                {stages.slice(1).map((s) => {
                  const v = stageTotals[s.id] ?? 0;
                  return (
                    <td key={s.id} className="px-3 py-3 text-center tabular-nums text-slate-700">
                      {v > 0 ? v : <span className="font-normal text-slate-300">-</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center tabular-nums text-rose-500">
                  {totalUnfollowed > 0 ? totalUnfollowed : <span className="font-normal text-slate-300">-</span>}
                </td>
              </tr>
            )}
            {!matrix.length && (
              <tr><td colSpan={stages.length + 2} className="py-12 text-center text-sm text-slate-400">ไม่มีลีดในช่วงวันที่นี้</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* By source */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-800">Lead Conversions แบ่งตามแหล่งที่มา</h3>
          <p className="mt-0.5 text-xs text-slate-500">{dateFrom} — {dateTo}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 w-64">แหล่งที่มา</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">ลีดใหม่</th>
              {stages.slice(1).map((s) => (
                <th key={s.id} className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                  {s.name}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-rose-400 whitespace-nowrap">
                เลิกติดตาม
              </th>
            </tr>
          </thead>
          <tbody>
            {sourceMatrix.map((row, i) => (
              <tr key={row.src} className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${i % 2 === 1 ? "bg-slate-50/40" : ""}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{row.src}</td>
                <td className="px-3 py-3 text-center font-bold tabular-nums text-brand-700">{row.total}</td>
                {stages.slice(1).map((s) => {
                  const v = row.stages.get(s.id) ?? 0;
                  return (
                    <td key={s.id} className="px-3 py-3 text-center tabular-nums">
                      {v > 0 ? <span className="font-medium text-slate-700">{v}</span> : <span className="text-slate-300">-</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center tabular-nums">
                  {row.unfollowed > 0 ? <span className="font-medium text-rose-500">{row.unfollowed}</span> : <span className="text-slate-300">-</span>}
                </td>
              </tr>
            ))}
            {sourceMatrix.length > 0 && (
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-3 text-slate-700">รวม</td>
                <td className="px-3 py-3 text-center tabular-nums text-brand-700">{filteredLeads.length}</td>
                {stages.slice(1).map((s) => {
                  const v = sourceStageTotals[s.id] ?? 0;
                  return (
                    <td key={s.id} className="px-3 py-3 text-center tabular-nums text-slate-700">
                      {v > 0 ? v : <span className="font-normal text-slate-300">-</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center tabular-nums text-rose-500">
                  {totalUnfollowed > 0 ? totalUnfollowed : <span className="font-normal text-slate-300">-</span>}
                </td>
              </tr>
            )}
            {!sourceMatrix.length && (
              <tr><td colSpan={stages.length + 2} className="py-12 text-center text-sm text-slate-400">ไม่มีลีดในช่วงวันที่นี้</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Dashboard 3: Chat Metrics ────────────────────────────────────────────────
type ChatConv = {
  id: string;
  created_at: string;
  ad_name: string | null;
  lead_id: string | null;
  sender_psid: string;
  isRepeat?: boolean;
};

type ChatMetricRow = {
  source: string;
  isRepeat: boolean;
  total: number;
  fast5: number;
  converted: number;
};

function pct(n: number, d: number): string {
  if (!d) return "";
  return `${Math.round((n / d) * 100)}%`;
}

function ChatMetricsView({
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
}: {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
}) {
  const [conversations, setConversations] = useState<ChatConv[]>([]);
  // first INBOUND message in range per conversation (= baseline for 5min response)
  const [firstInMap, setFirstInMap] = useState<Map<string, string>>(new Map());
  // first OUTBOUND message in range per conversation
  const [firstOutMap, setFirstOutMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      // Step 1: conversations CREATED within the date range only (exclude old ongoing threads)
      const { data: newConvs } = await supabase
        .from("conversations")
        .select("id, created_at, ad_name, lead_id, sender_psid")
        .gte("created_at", dateFrom + "T00:00:00+00:00")
        .lte("created_at", dateTo + "T23:59:59+00:00")
        .limit(5000);

      const convList = (newConvs ?? []) as ChatConv[];
      const convIds = convList.map((c) => c.id);

      if (!convIds.length) {
        setConversations([]);
        setFirstInMap(new Map());
        setFirstOutMap(new Map());
        setLoading(false);
        return;
      }

      // Step 2: Check which sender_psids have an older conversation (= returning visitor)
      const psids = [...new Set(convList.map((c) => c.sender_psid))];
      const { data: olderConvs } = await supabase
        .from("conversations")
        .select("sender_psid")
        .in("sender_psid", psids)
        .lt("created_at", dateFrom + "T00:00:00+00:00")
        .limit(5000);

      const returningPsids = new Set((olderConvs ?? []).map((c: { sender_psid: string }) => c.sender_psid));

      // Step 3: First inbound message in range per conversation (baseline for 5-min response)
      const { data: inboundMsgs } = await supabase
        .from("messages")
        .select("conversation_id, created_at")
        .in("conversation_id", convIds)
        .eq("direction", "inbound")
        .gte("created_at", dateFrom + "T00:00:00+00:00")
        .lte("created_at", dateTo + "T23:59:59+00:00")
        .order("created_at")
        .limit(5000);

      const firstInBatch = new Map<string, string>();
      for (const msg of (inboundMsgs ?? []) as { conversation_id: string; created_at: string }[]) {
        if (!firstInBatch.has(msg.conversation_id)) firstInBatch.set(msg.conversation_id, msg.created_at);
      }

      // Step 4: First outbound message in range per conversation
      const { data: outboundMsgs } = await supabase
        .from("messages")
        .select("conversation_id, created_at")
        .in("conversation_id", convIds)
        .eq("direction", "outbound")
        .gte("created_at", dateFrom + "T00:00:00+00:00")
        .lte("created_at", dateTo + "T23:59:59+00:00")
        .order("created_at")
        .limit(5000);

      const firstOutBatch = new Map<string, string>();
      for (const msg of (outboundMsgs ?? []) as { conversation_id: string; created_at: string }[]) {
        if (!firstOutBatch.has(msg.conversation_id)) firstOutBatch.set(msg.conversation_id, msg.created_at);
      }

      const tagged = convList.map((c) => ({ ...c, isRepeat: returningPsids.has(c.sender_psid) }));
      setConversations(tagged);
      setFirstInMap(firstInBatch);
      setFirstOutMap(firstOutBatch);
      setLoading(false);
    })();
  }, [dateFrom, dateTo]);

  const { metrics, totals } = useMemo(() => {
    const groups = new Map<string, { isRepeat: boolean; total: number; fast5: number; converted: number }>();

    for (const conv of conversations) {
      const isRepeat = !!conv.isRepeat;
      const source = isRepeat
        ? "ทักซ้ำ (เคยทักมาก่อน)"
        : (conv.ad_name ?? "Organic / Direct");

      if (!groups.has(source)) groups.set(source, { isRepeat, total: 0, fast5: 0, converted: 0 });
      const g = groups.get(source)!;
      g.total++;

      // 5min response: from first inbound in range to first outbound in range
      const firstIn = firstInMap.get(conv.id);
      const firstOut = firstOutMap.get(conv.id);
      if (firstIn && firstOut) {
        const diffMs = new Date(firstOut).getTime() - new Date(firstIn).getTime();
        if (diffMs >= 0 && diffMs <= 5 * 60 * 1000) g.fast5++;
      }

      if (conv.lead_id) g.converted++;
    }

    const rows: ChatMetricRow[] = [...groups.entries()]
      .map(([source, g]) => ({ source, ...g }))
      .sort((a, b) => {
        // repeat always last
        if (a.isRepeat && !b.isRepeat) return 1;
        if (!a.isRepeat && b.isRepeat) return -1;
        // organic after ads
        if (a.source === "Organic / Direct" && b.source !== "Organic / Direct") return 1;
        if (a.source !== "Organic / Direct" && b.source === "Organic / Direct") return -1;
        return b.total - a.total;
      });

    const t = rows.reduce(
      (acc, r) => ({ total: acc.total + r.total, fast5: acc.fast5 + r.fast5, converted: acc.converted + r.converted }),
      { total: 0, fast5: 0, converted: 0 },
    );

    return { metrics: rows, totals: t };
  }, [conversations, firstInMap, firstOutMap, dateFrom]);

  const newTotal = useMemo(
    () => metrics.filter((r) => !r.isRepeat).reduce((s, r) => s + r.total, 0),
    [metrics],
  );

  return (
    <div className="space-y-4">
      <DateRangePicker
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        suffix={
          <span className="text-sm text-slate-500">
            · {loading ? "กำลังโหลด…" : `${totals.total} บทสนทนา`}
          </span>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">แชทใหม่</p>
          <p className="text-4xl font-bold text-slate-800">{loading ? "…" : newTotal}</p>
          {totals.total > newTotal && (
            <p className="mt-1 text-xs text-slate-400">ทักซ้ำ {totals.total - newTotal} บทสนทนา</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">ตอบใน 5 นาที</p>
          <p className="text-4xl font-bold text-green-600">{loading ? "…" : totals.fast5}</p>
          {totals.total > 0 && (
            <p className="mt-1 text-sm text-slate-400">{pct(totals.fast5, totals.total)} ของทั้งหมด</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">เปลี่ยนเป็นลีด</p>
          <p className="text-4xl font-bold text-brand-700">{loading ? "…" : totals.converted}</p>
          {newTotal > 0 && (
            <p className="mt-1 text-sm text-slate-400">{pct(totals.converted, newTotal)} ของแชทใหม่</p>
          )}
        </div>
      </div>

      {/* Metrics table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-800">Chat Metrics แบ่งตามโฆษณา</h3>
          <p className="mt-0.5 text-xs text-slate-500">{dateFrom} — {dateTo} · แชทใหม่ = สร้าง conversation ในช่วงนี้ · ทักซ้ำ = conversation เก่าที่ส่งข้อความมาใหม่</p>
        </div>
        {loading ? (
          <div className="py-14 text-center text-sm text-slate-400">กำลังโหลด…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  ประเภท / โฆษณา
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                  บทสนทนา
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-green-600 whitespace-nowrap">
                  ตอบใน 5 นาที
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-brand-600 whitespace-nowrap">
                  เปลี่ยนเป็นลีด
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.map((row, i) => (
                <tr
                  key={row.source}
                  className={`hover:bg-slate-50 transition-colors ${row.isRepeat ? "bg-amber-50/30" : i % 2 === 1 ? "bg-slate-50/40" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-xs">
                    {row.isRepeat ? (
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                        {row.source}
                      </span>
                    ) : (
                      <span className="line-clamp-1">
                        {row.source === "Organic / Direct" ? "🌐 Organic / Direct" : `🎯 ${row.source}`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-2xl font-bold text-slate-800">{row.total}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-2xl font-bold text-green-600">{row.fast5}</span>
                    {row.total > 0 && (
                      <span className="ml-2 text-xs text-slate-400">{pct(row.fast5, row.total)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-2xl font-bold text-brand-700">{row.converted}</span>
                    {row.total > 0 && (
                      <span className="ml-2 text-xs text-slate-400">{pct(row.converted, row.total)}</span>
                    )}
                  </td>
                </tr>
              ))}
              {metrics.length > 0 && (
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-4 py-3 text-slate-700">รวม</td>
                  <td className="px-4 py-3 text-center text-slate-800">{totals.total}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-green-700">{totals.fast5}</span>
                    <span className="ml-2 text-xs font-normal text-slate-400">{pct(totals.fast5, totals.total)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-brand-700">{totals.converted}</span>
                    <span className="ml-2 text-xs font-normal text-slate-400">{pct(totals.converted, totals.total)}</span>
                  </td>
                </tr>
              )}
              {!metrics.length && (
                <tr>
                  <td colSpan={4} className="py-14 text-center text-sm text-slate-400">
                    ไม่มีข้อมูลแชทในช่วงวันที่นี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function Dashboard({
  leads,
  pipelineStages,
  profiles,
}: {
  leads: Lead[];
  pipelineStages: Stage[];
  profiles: Profile[];
}) {
  const [tab, setTab] = useState<DashTab>("pipeline");
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [chatDateFrom, setChatDateFrom] = useState(firstOfMonthStr());
  const [chatDateTo, setChatDateTo] = useState(todayStr());

  const activeStages = useMemo(() => pipelineStages.filter((s) => !s.is_unfollow), [pipelineStages]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const tabCls = (t: DashTab) =>
    `px-5 py-2 text-sm font-medium rounded-lg transition ${
      tab === t
        ? "bg-brand-700 text-white shadow-sm"
        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className={tabCls("pipeline")} onClick={() => setTab("pipeline")}>
          Pipeline
        </button>
        <button className={tabCls("conversions")} onClick={() => setTab("conversions")}>
          Lead Conversions
        </button>
        <button className={tabCls("chat")} onClick={() => setTab("chat")}>
          Chat Metrics
        </button>
      </div>

      {tab === "pipeline" && (
        <PipelineTable leads={leads} stages={activeStages} profileById={profileById} />
      )}
      {tab === "conversions" && (
        <ConversionsView
          leads={leads}
          stages={activeStages}
          profileById={profileById}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
        />
      )}
      {tab === "chat" && (
        <ChatMetricsView
          dateFrom={chatDateFrom}
          dateTo={chatDateTo}
          setDateFrom={setChatDateFrom}
          setDateTo={setChatDateTo}
        />
      )}
    </div>
  );
}
