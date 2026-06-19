"use client";

import { useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Profile, Tag } from "@/types/crm";
import { deleteRow } from "@/lib/helpers";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";

const supabase = createBrowserSupabase();

export function MyTagsPanel({
  tags,
  leads,
  profiles,
  userId,
  reload,
  toast,
  onOpenLead,
}: {
  tags: Tag[];
  leads: Lead[];
  profiles: Profile[];
  userId: string;
  reload: () => Promise<void>;
  toast: (message: string) => void;
  onOpenLead: (lead: Lead) => void;
}) {
  const [form, setForm] = useState({ name: "", color: "#0ea5e9" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());

  const globalTags = tags.filter((t) => t.type === "global");
  const myTags = tags.filter((t) => t.type === "personal" && t.created_by === userId);

  const filteredLeads = useMemo(() => {
    if (selectedTagIds.size === 0) return [];
    const ids = [...selectedTagIds];
    return leads.filter((lead) =>
      ids.every((tagId) => lead.lead_tags?.some((lt) => lt.tag_id === tagId)),
    );
  }, [leads, selectedTagIds]);

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  async function createPersonalTag() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("tags")
        .insert({ ...form, name: form.name.trim(), type: "personal", created_by: userId });
      if (error) {
        toast(error.message);
        return;
      }
      setForm({ name: "", color: "#0ea5e9" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function TagPill({ tag }: { tag: Tag }) {
    const active = selectedTagIds.has(tag.id);
    return (
      <button
        onClick={() => toggleTag(tag.id)}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition ${
          active
            ? "border-transparent text-white shadow"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        }`}
        style={active ? { backgroundColor: tag.color, borderColor: tag.color } : {}}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: active ? "rgba(255,255,255,0.6)" : tag.color }}
        />
        {tag.name}
      </button>
    );
  }

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  return (
    <div className="space-y-4">
      {/* Create personal tag */}
      <Panel title="แท็กของฉัน">
        <div className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_120px]">
          <Field label="ชื่อ Tag ส่วนตัว" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="สี" value={form.color} onChange={(v) => setForm({ ...form, color: v })} type="color" />
          <div className="flex items-end">
            <button
              className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50"
              disabled={busy}
              onClick={createPersonalTag}
            >
              {busy ? "Working…" : "สร้าง"}
            </button>
          </div>
        </div>

        {/* Tag selector */}
        <div className="space-y-3">
          {globalTags.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Global Tags</p>
              <div className="flex flex-wrap gap-2">
                {globalTags.map((t) => <TagPill key={t.id} tag={t} />)}
              </div>
            </div>
          )}
          {myTags.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tag ของฉัน</p>
                <button
                  className={`rounded px-1.5 py-0.5 text-xs font-medium transition ${
                    editing
                      ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                      : "text-slate-400 hover:text-slate-600 underline"
                  }`}
                  onClick={() => setEditing((e) => !e)}
                >
                  {editing ? "เสร็จแล้ว" : "แก้ไข"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {myTags.map((t) => (
                  <div key={t.id} className="flex items-center gap-1">
                    <TagPill tag={t} />
                    {editing && (
                      <button
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-600 hover:bg-rose-200"
                        title="ลบ tag นี้"
                        onClick={() => deleteRow("tags", t.id, reload, toast)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {globalTags.length === 0 && myTags.length === 0 && (
            <p className="text-sm text-slate-400">ยังไม่มี tag — สร้าง tag ส่วนตัวด้านบน</p>
          )}
        </div>

        {selectedTagIds.size > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-500">กรอง AND:</span>
            {[...selectedTagIds].map((id) => {
              const t = tags.find((x) => x.id === id);
              return t ? (
                <span
                  key={id}
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: t.color }}
                >
                  {t.name}
                </span>
              ) : null;
            })}
            <button
              className="ml-auto text-xs text-slate-400 underline hover:text-slate-700"
              onClick={() => setSelectedTagIds(new Set())}
            >
              ล้าง
            </button>
          </div>
        )}
      </Panel>

      {/* Lead results */}
      {selectedTagIds.size > 0 && (
        <Panel title={`ลีดที่มีทุก tag ที่เลือก (${filteredLeads.length})`}>
          {filteredLeads.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">ไม่พบลีด</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLeads.map((lead) => {
                const assignee = lead.assigned_to ? profileMap.get(lead.assigned_to) : null;
                return (
                  <div
                    key={lead.id}
                    className="flex cursor-pointer items-center gap-3 py-2.5 hover:bg-slate-50"
                    onClick={() => onOpenLead(lead)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{lead.customer_name}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {lead.phone && <span>{lead.phone}</span>}
                        {assignee && <span>· {assignee.full_name ?? assignee.email}</span>}
                        {lead.stage?.name && <span>· {lead.stage.name}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {lead.lead_tags?.map((lt) =>
                        lt.tags ? (
                          <span
                            key={lt.tag_id}
                            className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                            style={{ backgroundColor: lt.tags.color }}
                          >
                            {lt.tags.name}
                          </span>
                        ) : null,
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
