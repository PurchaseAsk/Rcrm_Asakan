"use client";

import { useMemo, useState } from "react";
import type { Lead, Profile, Stage } from "@/types/crm";

type DashTab = "pipeline" | "conversions";

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
          {/* Stage totals row */}
          <tr className="border-b-2 border-slate-200 bg-blue-50/60">
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 w-48"></th>
            {stages.map((s) => (
              <th key={s.id} className="px-3 py-3 text-center">
                <span className="text-xl font-bold text-brand-700">
                  {stageTotals[s.id] ?? 0}
                </span>
              </th>
            ))}
            <th className="px-3 py-3 text-center">
              <span className="text-xl font-bold text-slate-700">{grandTotal}</span>
            </th>
          </tr>
          {/* Column header row */}
          <tr className="border-b border-slate-200">
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              ผู้ใช้
            </th>
            {stages.map((s) => (
              <th
                key={s.id}
                className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 cursor-pointer select-none whitespace-nowrap hover:text-slate-900"
                onClick={() => toggleSort(s.id)}
              >
                {s.name}{sortIcon(s.id)}
              </th>
            ))}
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
                    {v > 0 ? (
                      <span className="font-semibold text-brand-700">{v}</span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-3 text-center font-semibold tabular-nums text-slate-800">
                {row.total}
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={stages.length + 2} className="py-12 text-center text-sm text-slate-400">
                ไม่มีลีด
              </td>
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

  const { days, series } = useMemo(() => {
    const dayList = buildDayRange(dateFrom, dateTo);
    const totalPerDay: Record<string, number> = {};
    const stagePerDay: Record<string, Record<string, number>> = {};
    dayList.forEach((d) => { totalPerDay[d] = 0; });

    filteredLeads.forEach((lead) => {
      const day = isoDay(lead.created_at);
      if (!(day in totalPerDay)) return;
      totalPerDay[day]++;
      const sid = lead.stage_id ?? "__none__";
      stagePerDay[sid] ??= {};
      stagePerDay[sid][day] = (stagePerDay[sid][day] ?? 0) + 1;
    });

    const s = [
      { name: "ลีดใหม่ (รวม)", color: CHART_COLORS[0], values: dayList.map((d) => totalPerDay[d]) },
      ...stages.slice(0, 7).map((st, i) => ({
        name: st.name,
        color: CHART_COLORS[i + 1] ?? "#94a3b8",
        values: dayList.map((d) => stagePerDay[st.id]?.[d] ?? 0),
      })),
    ];

    return { days: dayList, series: s };
  }, [filteredLeads, dateFrom, dateTo, stages]);

  const { matrix, stageTotals } = useMemo(() => {
    const m = new Map<string, { total: number; stages: Map<string, number> }>();
    filteredLeads.forEach((lead) => {
      const uid = lead.assigned_to ?? "__pool__";
      if (!m.has(uid)) m.set(uid, { total: 0, stages: new Map() });
      const row = m.get(uid)!;
      row.total++;
      const sid = lead.stage_id ?? "__none__";
      row.stages.set(sid, (row.stages.get(sid) ?? 0) + 1);
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
      }))
      .sort((a, b) => b.total - a.total);

    const st: Record<string, number> = {};
    filteredLeads.forEach((l) => {
      const sid = l.stage_id ?? "__none__";
      st[sid] = (st[sid] ?? 0) + 1;
    });

    return { matrix: rows, stageTotals: st };
  }, [filteredLeads, profileById]);

  return (
    <div className="space-y-4">
      {/* Date range filter */}
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
        <span className="text-sm text-slate-500">· ลีดใหม่ {filteredLeads.length} ราย</span>
      </div>

      {/* Line chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-4">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span
                className="inline-block h-2.5 w-6 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
          ))}
        </div>
        <LineChart days={days} series={series} />
      </div>

      {/* Conversion table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-800">Lead Conversions แบ่งตามผู้ใช้งาน</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {dateFrom} — {dateTo}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 w-48">
                ผู้ใช้
              </th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                ลีดใหม่
              </th>
              {stages.map((s) => (
                <th
                  key={s.id}
                  className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap"
                >
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr
                key={row.uid}
                className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${i % 2 === 1 ? "bg-slate-50/40" : ""}`}
              >
                <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                <td className="px-3 py-3 text-center font-bold tabular-nums text-brand-700">
                  {row.total}
                </td>
                {stages.map((s) => {
                  const v = row.stages.get(s.id) ?? 0;
                  return (
                    <td key={s.id} className="px-3 py-3 text-center tabular-nums">
                      {v > 0 ? (
                        <span className="font-medium text-slate-700">{v}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {matrix.length > 0 && (
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-3 text-slate-700">รวม</td>
                <td className="px-3 py-3 text-center tabular-nums text-brand-700">
                  {filteredLeads.length}
                </td>
                {stages.map((s) => {
                  const v = stageTotals[s.id] ?? 0;
                  return (
                    <td key={s.id} className="px-3 py-3 text-center tabular-nums text-slate-700">
                      {v > 0 ? v : <span className="font-normal text-slate-300">-</span>}
                    </td>
                  );
                })}
              </tr>
            )}
            {!matrix.length && (
              <tr>
                <td colSpan={stages.length + 2} className="py-12 text-center text-sm text-slate-400">
                  ไม่มีลีดในช่วงวันที่นี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
    </div>
  );
}
