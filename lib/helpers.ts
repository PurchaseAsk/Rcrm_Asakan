"use client";

import { createBrowserSupabase } from "@/lib/supabase";
import type { AppData, LeadDetail } from "@/types/app";
import type { Activity, DistributionRule, Lead, Page, Pipeline, Profile, RecallRule, Reminder, Role, Stage, StageRule, Tag, Team } from "@/types/crm";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabase = createBrowserSupabase();

// ── Pure UI helpers ──────────────────────────────────────────────────────────

/** Mirror of the SQL normalize_phone() function. Strips non-digits; converts +66/66 prefix → 0. */
export function normalizePhone(phone: string): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("66")) return "0" + digits.slice(2);
  return digits;
}

export function segmentClass(active: boolean) {
  return `h-9 rounded-md text-sm font-medium ${active ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;
}

export function pillClass(active: boolean) {
  return `inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ${active ? "bg-brand-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
}

export function roleLabel(role?: Role) {
  if (role === "admin") return "Admin";
  if (role === "team_lead") return "Team lead";
  return "Staff";
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

export function isPinned(lead: import("@/types/crm").Lead): boolean {
  return !!lead.pinned_until && new Date(lead.pinned_until) > new Date();
}

export function pinDaysLeft(lead: import("@/types/crm").Lead): number {
  if (!lead.pinned_until) return 0;
  return Math.max(0, Math.ceil((new Date(lead.pinned_until).getTime() - Date.now()) / 86400000));
}

export async function pinLead(leadId: string, reload: () => Promise<void>, toast: (msg: string) => void) {
  const until = new Date(Date.now() + 3 * 86400 * 1000).toISOString();
  const { error } = await supabase.from("leads").update({ pinned_until: until }).eq("id", leadId);
  if (error) return toast(error.message);
  await reload();
  toast("📌 Pin lead แล้ว (3 วัน)");
}

export async function unpinLead(leadId: string, reload: () => Promise<void>, toast: (msg: string) => void) {
  const { error } = await supabase.from("leads").update({ pinned_until: null }).eq("id", leadId);
  if (error) return toast(error.message);
  await reload();
}

export function leadAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days} วัน ${hours} ชม.`;
  if (hours > 0) return `${hours} ชม. ${mins} นาที`;
  return `${mins} นาที`;
}

export const MANUAL_SOURCES: { value: string; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "website", label: "Website" },
  { value: "walk_in", label: "Walk-in (เดินเข้ามา)" },
  { value: "cold_call", label: "Cold Call" },
  { value: "referral", label: "แนะนำ (Referral)" },
  { value: "event", label: "งานอีเวนต์ / บูธ" },
  { value: "line", label: "Line" },
  { value: "other", label: "อื่นๆ" },
];

export function sourceLabel(source: string | null, meta?: { form_name?: string | null; campaign_name?: string | null } | null): string {
  if (source === "facebook") return meta?.form_name ?? meta?.campaign_name ?? "Facebook";
  if (source === "tiktok") return "TikTok";
  if (source === "chat") return "Chat (Inbox)";
  if (source === "website") return "Website";
  if (source === "walk_in") return "Walk-in";
  if (source === "cold_call") return "Cold Call";
  if (source === "referral") return "แนะนำ (Referral)";
  if (source === "event") return "งานอีเวนต์";
  if (source === "line") return "Line";
  if (source === "other") return "อื่นๆ";
  return source ?? "ไม่ระบุ";
}

export function userIdsLabel(ids: string[] | undefined, profiles: Profile[]) {
  if (!ids?.length) return "-";
  return ids
    .map(
      (id) =>
        profiles.find((profile) => profile.id === id)?.full_name ||
        profiles.find((profile) => profile.id === id)?.email ||
        id,
    )
    .join(", ");
}

export function actorName(userId: string | null | undefined, profiles: Profile[]) {
  if (!userId) return "CRM";
  const profile = profiles.find((item) => item.id === userId);
  return profile?.full_name || profile?.email || userId;
}

export function recallCountdownText(lead: Lead, stages: Stage[]) {
  const stage = stages.find((item) => item.id === lead.stage_id);
  if (!stage || lead.status === "unfollowed") return "No recall countdown";
  return `Last activity ${new Date(lead.last_activity_at).toLocaleString("th-TH")}`;
}

// ── Table / row types ────────────────────────────────────────────────────────

export type ToggleableTable = "distribution_rules" | "auto_recall_rules" | "facebook_pages" | "line_oa_accounts";
export type DeletableTable =
  | "distribution_rules"
  | "auto_recall_rules"
  | "facebook_pages"
  | "line_oa_accounts"
  | "lead_reminders"
  | "tags"
  | "pipelines"
  | "teams";

// ── Supabase mutation helpers ────────────────────────────────────────────────

export async function toggleBoolean(
  table: ToggleableTable,
  id: string,
  field: string,
  value: boolean,
  reload: () => Promise<void>,
  toast: (message: string) => void,
) {
  const { error } = await supabase.from(table).update({ [field]: value }).eq("id", id);
  if (error) return toast(error.message);
  await reload();
}

export async function deleteRow(
  table: DeletableTable,
  id: string,
  reload: () => Promise<void>,
  toast: (message: string) => void,
) {
  const ok = window.confirm("Delete this item? This action cannot be undone.");
  if (!ok) return;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return toast(error.message);
  await reload();
  toast("Deleted");
}

export async function toggleLeadTag(
  leadId: string,
  tagId: string,
  active: boolean,
  reload: () => Promise<void>,
  toast: (message: string) => void,
) {
  const result = active
    ? await supabase.from("lead_tags").delete().match({ lead_id: leadId, tag_id: tagId })
    : await supabase.from("lead_tags").insert({ lead_id: leadId, tag_id: tagId });
  if (result.error) return toast(result.error.message);
  await reload();
}

export async function updatePipeline(
  id: string,
  patch: Partial<import("@/types/crm").Pipeline>,
  reload: () => Promise<void>,
  toast: (message: string) => void,
) {
  const { error } = await supabase.from("pipelines").update(patch).eq("id", id);
  if (error) return toast(error.message);
  await reload();
}

export async function updateStage(
  id: string,
  patch: Partial<Stage>,
  reload: () => Promise<void>,
  toast: (message: string) => void,
) {
  const { error } = await supabase.from("funnel_stages").update(patch).eq("id", id);
  if (error) return toast(error.message);
  await reload();
}

export async function normalizeStagePositions(pipelineId: string) {
  const { data, error } = await supabase
    .from("funnel_stages")
    .select("id,position")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });

  if (error || !data) return;

  await Promise.all(
    data.map((stage, index) =>
      supabase.from("funnel_stages").update({ position: index + 1 }).eq("id", stage.id),
    ),
  );
}

export async function moveStage(stages: Stage[], index: number, dir: number, reload: () => Promise<void>) {
  const current = stages[index];
  const other = stages[index + dir];
  if (!current || !other) return;
  await Promise.all([
    supabase.from("funnel_stages").update({ position: other.position }).eq("id", current.id),
    supabase.from("funnel_stages").update({ position: current.position }).eq("id", other.id),
  ]);
  await reload();
}

export async function toggleRule(
  rule: DistributionRule,
  reload: () => Promise<void>,
  toast: (message: string) => void,
) {
  await toggleBoolean("distribution_rules", rule.id, "is_active", !rule.is_active, reload, toast);
}

export async function removeTeamMember(
  teamId: string,
  userId: string,
  reload: () => Promise<void>,
  toast: (message: string) => void,
) {
  const { error } = await supabase.from("team_members").delete().match({ team_id: teamId, user_id: userId });
  if (error) return toast(error.message);
  await reload();
}

export async function toggleTeamLead(
  teamId: string,
  userId: string,
  isLead: boolean,
  reload: () => Promise<void>,
  toast: (message: string) => void,
) {
  const { error } = await supabase.from("team_members").update({ is_lead: !isLead }).match({ team_id: teamId, user_id: userId });
  if (error) return toast(error.message);
  await reload();
}

export async function addPipelineTeam(
  pipelineId: string,
  teamId: string,
  reload: () => Promise<void>,
  toast: (message: string) => void,
  done: () => void,
) {
  if (!teamId) return;
  const { error } = await supabase.from("pipeline_teams").insert({ pipeline_id: pipelineId, team_id: teamId });
  if (error) return toast(error.message);
  done();
  await reload();
}

export async function removePipelineTeam(
  pipelineId: string,
  teamId: string,
  reload: () => Promise<void>,
  toast: (message: string) => void,
) {
  const { error } = await supabase.from("pipeline_teams").delete().match({ pipeline_id: pipelineId, team_id: teamId });
  if (error) return toast(error.message);
  await reload();
}

export async function addPipelineUser(
  pipelineId: string,
  userId: string,
  reload: () => Promise<void>,
  toast: (message: string) => void,
  done: () => void,
) {
  if (!userId) return;
  const { error } = await supabase.from("pipeline_users").insert({ pipeline_id: pipelineId, user_id: userId });
  if (error) return toast(error.message);
  done();
  await reload();
}

export async function removePipelineUser(
  pipelineId: string,
  userId: string,
  reload: () => Promise<void>,
  toast: (message: string) => void,
) {
  const { error } = await supabase.from("pipeline_users").delete().match({ pipeline_id: pipelineId, user_id: userId });
  if (error) return toast(error.message);
  await reload();
}

export async function runRecall(reload: () => Promise<void>, toast: (message: string) => void) {
  const { data, error } = await supabase.rpc("recall_inactive_leads");
  if (error) return toast(error.message);
  await reload();
  toast(`Recalled ${data ?? 0} leads`);
}

export async function checkReminders(
  userId: string,
  toast: (message: string) => void,
  reloadSelectedLead: () => Promise<void>,
) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("lead_reminders")
    .select("*, leads(customer_name)")
    .eq("created_by", userId)
    .eq("is_done", false)
    .lte("remind_at", now.toISOString())
    .limit(20);
  const due = (data || []) as Reminder[];
  if (!due.length) return;

  // Notify but do NOT auto-mark done — user must confirm completion
  due.forEach((r) => toast(`🔔 Reminder: ${r.leads?.customer_name || "Lead"}${r.note ? ` · ${r.note}` : ""}`));

  // Rollover overdue reminders (from a previous day) to today 09:00
  const overdue = due.filter((r) => new Date(r.remind_at) < todayStart);
  if (overdue.length) {
    const rolloverTime = new Date(todayStart);
    rolloverTime.setHours(9, 0, 0, 0);

    await Promise.all(
      overdue.map(async (r) => {
        const originalDate = new Date(r.remind_at).toLocaleDateString("th-TH");
        const baseNote = r.note?.replace(/\s*\(ค้างมาจาก[^)]*\)/, "").trim() || "";
        const rolloverNote = `${baseNote}${baseNote ? " " : ""}(ค้างมาจาก ${originalDate})`.trim();
        await Promise.all([
          supabase.from("lead_reminders").insert({
            lead_id: r.lead_id,
            remind_at: rolloverTime.toISOString(),
            note: rolloverNote,
            created_by: userId,
          }),
          supabase.from("lead_reminders").update({ is_done: true }).eq("id", r.id),
        ]);
      }),
    );
    await reloadSelectedLead();
  }
}

export async function simulateLead(
  data: AppData,
  activePipelineId: string,
  userId: string,
  setData: (data: AppData) => void,
  toast: (message: string) => void,
) {
  if (!data.pages.length || !data.stages.length) return toast("Create a page and stage first");
  const activeRules = data.rules.filter((rule) => rule.is_active);
  const selectedRule =
    activeRules.find((rule) => activePipelineId && rule.pipeline_id === activePipelineId) ||
    activeRules.find((rule) => rule.pipeline_id) ||
    activeRules[0];
  const page = data.pages.find((item) => item.id === selectedRule?.page_id) || data.pages[0];
  const pipelineId = activePipelineId || selectedRule?.pipeline_id || null;
  const stage =
    data.stages
      .filter((item) => (pipelineId ? item.pipeline_id === pipelineId : !item.pipeline_id) && !item.is_unfollow)
      .sort((a, b) => a.position - b.position)[0] || data.stages.find((item) => !item.is_unfollow);
  const names = ["สมชาย ใจดี", "นภา สุขใจ", "วิชัย มานะ", "กัญญา สวัสดี", "ลูกค้าทดสอบ"];
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      customer_name: names[Math.floor(Math.random() * names.length)],
      facebook_id: `fb_${Math.floor(Math.random() * 1_000_000_000)}`,
      page_id: page.id,
      pipeline_id: pipelineId,
      stage_id: stage?.id,
      status: "active",
      source: "facebook",
      last_activity_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return toast(error.message);
  await supabase.from("lead_activities").insert({
    lead_id: lead.id,
    type: "created",
    content: `${actorName(userId, data.profiles)} created test lead from ${page.name}`,
    created_by: userId,
  });
  await supabase.rpc("distribute_lead", { p_lead_id: lead.id });
  setData(await loadCrmData(supabase));
  toast("Lead simulated");
}

export async function updateLeadStage(
  leadId: string,
  stage: Stage,
  userId: string,
  actorLabel: string,
  requestStageChangeNote: (stageName: string, stageId: string) => Promise<string | null>,
  toast: (message: string) => void,
) {
  const note = await requestStageChangeNote(stage.name, stage.id);
  if (!note) return false;
  const { error } = await supabase
    .from("leads")
    .update({
      stage_id: stage.id,
      status: stage.is_unfollow ? "unfollowed" : "active",
      last_activity_at: new Date().toISOString(),
      stage_entered_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) {
    toast(error.message);
    return false;
  }
  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    stage_id: stage.id,
    type: "stage_change",
    content: `${actorLabel} moved lead to ${stage.name}: ${note}`,
    created_by: userId,
  });

  // Fire CAPI event if stage has one configured
  if (stage.capi_event) {
    void fetch("/api/facebook/capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, stage_id: stage.id }),
    }).then(async (r) => {
      const data = (await r.json()) as { ok?: boolean; skipped?: boolean; reason?: string; error?: string; event?: string };
      if (data.skipped) toast(`⚠️ CAPI skipped: ${data.reason ?? "no pixel/token"}`);
      else if (data.error) toast(`❌ CAPI error: ${data.error}`);
      else if (data.ok) toast(`✅ CAPI sent: ${data.event}`);
    }).catch(() => toast("❌ CAPI: ส่งไม่ได้ (network error)"));
  }

  return true;
}

export async function bootstrap(
  userId: string,
  email: string,
  setProfile: (profile: Profile | null) => void,
  setData: (data: AppData) => void,
  toast: (message: string) => void,
) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", userId)
    .single();
  if (profileError) {
    toast(`Load profile failed: ${profileError.message}`);
  }
  setProfile((profile as Profile) || null);
  try {
    setData(await loadCrmData(supabase, { role: (profile as Profile | null)?.role, userId }));
    toast("CRM loaded");
  } catch (error) {
    toast(error instanceof Error ? error.message : "Failed to load CRM data");
  }
}

async function fetchAllLeads(
  client: SupabaseClient,
  opts?: { role?: Role; userId?: string },
) {
  const SELECT = "*, stage:funnel_stages(*), page:facebook_pages(id,page_id,name,is_active), assigned:profiles!leads_assigned_to_fkey(id,email,full_name,role), lead_tags(tag_id, tags(id,name,color,type,created_by))";
  const PAGE = 1000;
  const MAX = 8000;
  let all: Lead[] = [];
  let from = 0;
  while (true) {
    let q = client.from("leads").select(SELECT)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (opts?.role === "staff" && opts?.userId) {
      q = q.or(`assigned_to.eq.${opts.userId},assigned_to.is.null`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`Load leads failed: ${error.message}`);
    if (!data?.length) break;
    all = all.concat(data as Lead[]);
    if (data.length < PAGE || all.length >= MAX) break;
    from += PAGE;
  }
  return { data: all, error: null };
}

export async function loadCrmData(
  client: SupabaseClient,
  opts?: { role?: Role; userId?: string },
): Promise<AppData> {
  const [leads, stages, pipelines, pages, teams, profiles, rules, recallRules, tags, lineOaAccounts, stageRules] = await Promise.all([
    fetchAllLeads(client, opts),
    client.from("funnel_stages").select("*").order("position"),
    client
      .from("pipelines")
      .select("*, pipeline_teams(team_id, teams(name)), pipeline_users(user_id, profiles(id,email,full_name,role))")
      .eq("is_active", true)
      .order("created_at"),
    client.from("facebook_pages").select("id,page_id,name,is_active").order("created_at", { ascending: false }),
    client.from("teams").select("*, team_members(user_id,is_lead,profiles(id,email,full_name,role))").order("created_at"),
    client.from("profiles").select("id,email,full_name,role,sales_suffix"),
    client
      .from("distribution_rules")
      .select("*, teams(name), facebook_pages(name), pipelines(name,color)")
      .order("created_at", { ascending: false }),
    client.from("auto_recall_rules").select("*, funnel_stages(name)").order("created_at", { ascending: false }),
    client.from("tags").select("*").order("created_at"),
    client.from("line_oa_accounts").select("id,name,channel_id,is_active,bot_user_id").order("created_at"),
    client.from("stage_rules").select("id, stage_id, questions"),
  ]);

  const queryResults = { leads, stages, pipelines, pages, teams, profiles, rules, recallRules, tags, lineOaAccounts, stageRules };
  for (const [name, result] of Object.entries(queryResults)) {
    if (result.error) {
      throw new Error(`Load ${name} failed: ${result.error.message}`);
    }
  }

  const rawTags = (tags.data || []) as Tag[];
  const visibleTags = opts?.userId
    ? rawTags.filter((tag) => tag.type === "global" || tag.created_by === opts.userId)
    : rawTags.filter((tag) => tag.type === "global");
  const visibleTagIds = new Set(visibleTags.map((tag) => tag.id));
  const visibleLeads = ((leads.data || []) as Lead[]).map((lead) => ({
    ...lead,
    lead_tags: lead.lead_tags?.filter((item) => item.tags && visibleTagIds.has(item.tag_id)) ?? [],
  }));

  return {
    leads: visibleLeads,
    stages: (stages.data || []) as Stage[],
    pipelines: (pipelines.data || []) as Pipeline[],
    pages: (pages.data || []) as Page[],
    teams: (teams.data || []) as Team[],
    profiles: (profiles.data || []) as Profile[],
    rules: (rules.data || []) as DistributionRule[],
    recallRules: (recallRules.data || []) as RecallRule[],
    tags: visibleTags,
    lineOaAccounts: (lineOaAccounts.data || []) as import("@/types/crm").LineOaAccount[],
    stageRules: (stageRules.data || []) as StageRule[],
  };
}

export async function loadLeadDetail(leadId: string): Promise<LeadDetail> {
  const [activities, reminders] = await Promise.all([
    supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("lead_reminders").select("*").eq("lead_id", leadId).eq("is_done", false).order("remind_at"),
  ]);
  return {
    activities: (activities.data || []) as Activity[],
    reminders: (reminders.data || []) as Reminder[],
  };
}
