"use client";

import { useMemo, useState } from "react";
import { Plus, RefreshCcw, X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Pipeline, Profile, Stage } from "@/types/crm";
import { MANUAL_SOURCES, pillClass } from "@/lib/helpers";
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
}) {
  const canFilterByMember = !!filterableProfiles?.length && !!setAssigneeFilter;

  const [showModal, setShowModal] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  function openModal() {
    setDraft({ ...EMPTY_DRAFT, pipeline_id: pipelines[0]?.id ?? "" });
    setError("");
    setShowModal(true);
  }

  async function submit() {
    setError("");
    if (!draft.customer_name.trim()) return setError("กรุณากรอกชื่อลูกค้า");
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

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-950">Leads</h1>
          <p className="text-sm text-slate-500">Click a lead to edit details, notes, tags, and reminders.</p>
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
      <LeadTable leads={leads} profiles={profiles} onOpenLead={onOpenLead} />

      {/* Create Lead Modal */}
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
                {field("เบอร์โทร", inp("0812345678", "phone", "tel", { maxLength: 15 }))}
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
    </section>
  );
}
