"use client";

// This page requires auth and a live Supabase connection — skip static prerendering.
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Boxes,
  Check,
  CircleDollarSign,
  Clock,
  GripVertical,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCcw,
  Search,
  Settings,
  Split,
  Tags,
  Trash2,
  UserRound,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type {
  Activity,
  DistributionRule,
  Lead,
  Page,
  Pipeline,
  Profile,
  RecallRule,
  Reminder,
  Role,
  Stage,
  Tag,
  Team,
} from "@/types/crm";

type TabId =
  | "dashboard"
  | "leads"
  | "funnel"
  | "teams"
  | "rules"
  | "recall"
  | "stages"
  | "tags"
  | "pipelines"
  | "pages";

type AppData = {
  leads: Lead[];
  stages: Stage[];
  pipelines: Pipeline[];
  pages: Page[];
  teams: Team[];
  profiles: Profile[];
  rules: DistributionRule[];
  recallRules: RecallRule[];
  tags: Tag[];
};

type LeadDetail = {
  activities: Activity[];
  reminders: Reminder[];
};

type StageNoteRequest = {
  stageName: string;
  resolve: (note: string | null) => void;
};

type RuleForm = {
  page_id: string;
  pipeline_id: string;
  assign_type: string;
  team_id: string;
  user_id: string;
  method: string;
};

const emptyData: AppData = {
  leads: [],
  stages: [],
  pipelines: [],
  pages: [],
  teams: [],
  profiles: [],
  rules: [],
  recallRules: [],
  tags: [],
};

const tabs: { id: TabId; label: string; icon: LucideIcon; managerOnly?: boolean }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "leads", label: "Leads", icon: UserRound },
  { id: "funnel", label: "Funnel", icon: Split },
  { id: "teams", label: "Teams", icon: Users },
  { id: "rules", label: "Rules", icon: Settings, managerOnly: true },
  { id: "recall", label: "Recall", icon: Clock, managerOnly: true },
  { id: "stages", label: "Stages", icon: Workflow, managerOnly: true },
  { id: "tags", label: "Tags", icon: Tags },
  { id: "pipelines", label: "Pipelines", icon: Boxes },
  { id: "pages", label: "Pages", icon: Bell, managerOnly: true },
];

const supabase = createBrowserSupabase();

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<AppData>(emptyData);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [activePipelineId, setActivePipelineId] = useState("");
  const [leadFilter, setLeadFilter] = useState<"active" | "unfollowed">("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetail, setLeadDetail] = useState<LeadDetail>({ activities: [], reminders: [] });
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [managingPipelineId, setManagingPipelineId] = useState<string | null>(null);
  const [stageNoteRequest, setStageNoteRequest] = useState<StageNoteRequest | null>(null);

  // Ref so Realtime and reminder callbacks always read the latest leadId
  // without causing channel teardown on every lead open (H-2)
  const selectedLeadIdRef = useRef<string | null>(null);
  useEffect(() => { selectedLeadIdRef.current = selectedLeadId; }, [selectedLeadId]);

  // Ref to clear previous toast timer so rapid toasts don't stack (L-3)
  const toastTimerRef = useRef<number | null>(null);

  const currentUserId = session?.user.id || "";
  const canManage = profile?.role === "admin" || profile?.role === "team_lead";
  const selectedLead = data.leads.find((lead) => lead.id === selectedLeadId) || null;
  const managingPipeline = data.pipelines.find((pipeline) => pipeline.id === managingPipelineId) || null;

  useEffect(() => {
    let mounted = true;

    const sessionTimeout = window.setTimeout(() => {
      if (!mounted) return;
      setSession(null);
      setLoading(false);
    }, 2500);

    supabase.auth
      .getSession()
      .then(({ data: authData }) => {
        if (!mounted) return;
        window.clearTimeout(sessionTimeout);
        setSession(authData.session);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        window.clearTimeout(sessionTimeout);
        setSession(null);
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      window.clearTimeout(sessionTimeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setData(emptyData);
      return;
    }

    void bootstrap(session.user.id, session.user.email || "", setProfile, setData, showToast);
    const reloadLiveData = () => {
      void loadCrmData(supabase)
        .then(setData)
        .catch((error) => showToast(error instanceof Error ? error.message : "Failed to reload CRM data"));
    };

    const channel = supabase
      .channel("crm-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, reloadLiveData)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_activities" }, () => {
        const id = selectedLeadIdRef.current;
        if (id) void loadLeadDetail(id).then(setLeadDetail);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user]); // selectedLeadId removed — use ref to avoid channel teardown on every lead open

  useEffect(() => {
    if (!currentUserId) return;
    void checkReminders(currentUserId, showToast, reloadSelectedLead);
    const timer = window.setInterval(() => {
      void checkReminders(currentUserId, showToast, reloadSelectedLead);
    }, 30_000);
    return () => window.clearInterval(timer);
    // reloadSelectedLead reads selectedLeadIdRef so no dep on selectedLeadId needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => {
    if (!canManage && ["rules", "recall", "stages", "pages"].includes(activeTab)) {
      setActiveTab("dashboard");
    }
  }, [activeTab, canManage]);

  useEffect(() => {
    if (!data.pipelines.length) {
      if (activePipelineId) setActivePipelineId("");
      return;
    }

    const activeStillExists = data.pipelines.some((pipeline) => pipeline.id === activePipelineId);
    if (!activeStillExists) {
      setActivePipelineId(data.pipelines[0].id);
    }
  }, [activePipelineId, data.pipelines]);

  const visibleTabs = tabs.filter((tab) => !tab.managerOnly || canManage);

  const myTeamMemberIds = useMemo(() => {
    if (!currentUserId) return [];
    const ids = new Set<string>();
    data.teams.forEach((team) => {
      const members = team.team_members || [];
      if (members.some((member) => member.user_id === currentUserId)) {
        members.forEach((member) => ids.add(member.user_id));
      }
    });
    return [...ids];
  }, [currentUserId, data.teams]);

  const visibleLeads = useMemo(() => {
    if (!profile || !currentUserId) return [];
    const scoped = activePipelineId ? data.leads.filter((lead) => lead.pipeline_id === activePipelineId) : data.leads;

    if (profile.role === "admin") return scoped;
    if (profile.role === "team_lead") {
      return scoped.filter(
        (lead) => !lead.assigned_to || lead.assigned_to === currentUserId || myTeamMemberIds.includes(lead.assigned_to),
      );
    }
    return scoped.filter((lead) => !lead.assigned_to || lead.assigned_to === currentUserId);
  }, [activePipelineId, currentUserId, data.leads, myTeamMemberIds, profile]);

  const pipelineStages = useMemo(() => {
    if (!activePipelineId) return data.stages;
    const scoped = data.stages.filter((stage) => stage.pipeline_id === activePipelineId);
    return scoped.length ? scoped : data.stages.filter((stage) => !stage.pipeline_id);
  }, [activePipelineId, data.stages]);

  const editablePipelineStages = useMemo(() => {
    if (!activePipelineId) return [];
    return data.stages.filter((stage) => stage.pipeline_id === activePipelineId);
  }, [activePipelineId, data.stages]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleLeads.filter((lead) => {
      const byStatus = leadFilter === "unfollowed" ? lead.status === "unfollowed" : lead.status !== "unfollowed";
      if (!byStatus) return false;
      if (!q) return true;
      const haystack = [
        lead.customer_name,
        lead.phone,
        lead.email,
        lead.facebook_id,
        lead.page?.name,
        lead.stage?.name,
        lead.assigned?.full_name,
        lead.assigned?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [leadFilter, search, visibleLeads]);

  function showToast(message: string) {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
      toastTimerRef.current = null;
    }, 3200);
  }

  async function reload() {
    try {
      setData(await loadCrmData(supabase, { role: profile?.role, userId: currentUserId }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to reload CRM data");
    }
  }

  async function reloadSelectedLead() {
    await reload();
    const id = selectedLeadIdRef.current;
    if (id) setLeadDetail(await loadLeadDetail(id));
  }

  async function openLead(lead: Lead) {
    setSelectedLeadId(lead.id);
    setLeadDetail(await loadLeadDetail(lead.id));
  }

  function requestStageChangeNote(stageName: string) {
    return new Promise<string | null>((resolve) => {
      setStageNoteRequest({ stageName, resolve });
    });
  }

  if (loading) {
    return <FullScreenState title="Opening CRM" description="Checking session and Supabase connection" />;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <main className="min-h-dvh bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 xl:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white shadow-sm">
              RP
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight text-slate-950">ReadyPlanet CRM</div>
              <div className="text-xs text-slate-500">{roleLabel(profile?.role)} · Supabase Edition</div>
            </div>
          </div>

          <label className="hidden min-w-0 flex-1 items-center justify-center md:flex">
            <div className="flex w-full max-w-3xl items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <Search size={16} />
              <input
                className="w-full bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search leads, phone, page, stage, assignee"
              />
            </div>
          </label>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() => simulateLead(data, activePipelineId, currentUserId, setData, showToast)}
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Simulate</span>
            </button>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
              aria-label="Sign out"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <div className="grid w-full gap-4 px-3 py-4 sm:px-4 xl:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm lg:sticky lg:top-20 lg:h-[calc(100dvh-96px)]">
          <nav className="grid grid-cols-2 gap-1 lg:grid-cols-1">
            {visibleTabs.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex h-11 items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition ${
                    active ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="md:hidden">
            <input
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-600"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search leads"
            />
          </div>

          {data.leads.length >= 500 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              แสดง 500 ลีดล่าสุด — ลีดที่เก่ากว่าอาจไม่แสดงในหน้านี้
            </div>
          ) : null}

          <PipelineBar pipelines={data.pipelines} activePipelineId={activePipelineId} onChange={setActivePipelineId} />

          {activeTab === "dashboard" && <Dashboard leads={visibleLeads} pipelines={data.pipelines} rules={data.rules} />}
          {activeTab === "leads" && (
            <LeadsPanel
              leads={filteredLeads}
              filter={leadFilter}
              setFilter={setLeadFilter}
              profiles={data.profiles}
              onOpenLead={openLead}
              reload={reload}
            />
          )}
          {activeTab === "funnel" && (
            <FunnelBoard
              stages={pipelineStages}
              leads={filteredLeads}
              draggedLeadId={draggedLeadId}
              setDraggedLeadId={setDraggedLeadId}
              onMoveLead={async (leadId, stage) => {
                const moved = await updateLeadStage(leadId, stage, currentUserId, actorName(currentUserId, data.profiles), requestStageChangeNote, showToast);
                if (moved) await reload();
              }}
              onOpenLead={openLead}
            />
          )}
          {activeTab === "teams" && <TeamsPanel teams={data.teams} profiles={data.profiles} userId={currentUserId} reload={reload} toast={showToast} />}
          {activeTab === "rules" && canManage && (
            <RulesPanel rules={data.rules} pages={data.pages} teams={data.teams} pipelines={data.pipelines} profiles={data.profiles} reload={reload} toast={showToast} />
          )}
          {activeTab === "recall" && canManage && (
            <RecallPanel rules={data.recallRules} stages={data.stages} leads={data.leads} profiles={data.profiles} userId={currentUserId} reload={reload} toast={showToast} />
          )}
          {activeTab === "stages" && canManage && (
            activePipelineId ? (
              <StagesPanel stages={editablePipelineStages} activePipelineId={activePipelineId} leads={data.leads} reload={reload} toast={showToast} />
            ) : (
              <Panel title="Funnel stages">
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <div className="font-semibold text-slate-950">Select a pipeline first</div>
                  <p className="mt-1 text-sm text-slate-500">
                    Funnel stages are edited per pipeline. Choose a pipeline above to create, reorder, or edit its stages.
                  </p>
                </div>
              </Panel>
            )
          )}
          {activeTab === "tags" && <TagsPanel tags={data.tags} userId={currentUserId} reload={reload} toast={showToast} />}
          {activeTab === "pipelines" && (
            <PipelinePanel
              pipelines={data.pipelines}
              leads={data.leads}
              userId={currentUserId}
              canManage={canManage}
              reload={reload}
              toast={showToast}
              onManage={setManagingPipelineId}
            />
          )}
          {activeTab === "pages" && canManage && <PagesPanel pages={data.pages} userId={currentUserId} reload={reload} toast={showToast} />}
        </section>
      </div>

      {selectedLead ? (
        <LeadDrawer
          lead={selectedLead}
          detail={leadDetail}
          stages={pipelineStages}
          profiles={data.profiles}
          tags={data.tags}
          userId={currentUserId}
          requestStageChangeNote={requestStageChangeNote}
          onClose={() => setSelectedLeadId(null)}
          reload={reloadSelectedLead}
          toast={showToast}
        />
      ) : null}

      {managingPipeline ? (
        <PipelineManagementModal
          pipeline={managingPipeline}
          stages={data.stages.filter((stage) => stage.pipeline_id === managingPipeline.id)}
          recallRules={data.recallRules}
          teams={data.teams}
          profiles={data.profiles}
          leads={data.leads}
          userId={currentUserId}
          reload={reload}
          toast={showToast}
          onClose={() => setManagingPipelineId(null)}
        />
      ) : null}

      {toast ? <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-slate-950 px-4 py-3 text-sm text-white shadow-xl">{toast}</div> : null}
      {stageNoteRequest ? (
        <StageChangeNoteModal
          stageName={stageNoteRequest.stageName}
          onCancel={() => {
            stageNoteRequest.resolve(null);
            setStageNoteRequest(null);
          }}
          onConfirm={(note) => {
            stageNoteRequest.resolve(note);
            setStageNoteRequest(null);
          }}
        />
      ) : null}
    </main>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage("");
    const result =
      mode === "password"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    setMessage(result.error?.message || (mode === "magic" ? "Magic Link sent. Please check email." : ""));
  }

  async function signUp() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    setMessage(error?.message || "Account created. Check email if confirmation is enabled.");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-brand-700 font-bold text-white">RP</div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">ReadyPlanet CRM</h1>
          <p className="text-sm text-slate-500">Sign in to manage leads, teams, and pipelines.</p>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button className={segmentClass(mode === "password")} onClick={() => setMode("password")}>Password</button>
          <button className={segmentClass(mode === "magic")} onClick={() => setMode("magic")}>Magic Link</button>
        </div>

        <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
        {mode === "password" ? <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" /> : null}
        {message ? <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}

        <button className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-50" disabled={busy || !email || (mode === "password" && !password)} onClick={submit}>
          {busy ? "Working..." : mode === "password" ? "Sign in" : "Send Magic Link"}
        </button>
        {mode === "password" ? (
          <button className="mt-2 h-11 w-full rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={busy || !email || !password} onClick={signUp}>
            Create account
          </button>
        ) : null}
      </section>
    </main>
  );
}

function PipelineBar({ pipelines, activePipelineId, onChange }: { pipelines: Pipeline[]; activePipelineId: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {pipelines.length ? (
        pipelines.map((pipeline) => (
          <button key={pipeline.id} className={pillClass(activePipelineId === pipeline.id)} onClick={() => onChange(pipeline.id)}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pipeline.color }} />
            {pipeline.name}
          </button>
        ))
      ) : (
        <span className="px-2 py-1 text-sm text-slate-500">No pipelines yet</span>
      )}
    </div>
  );
}

function Dashboard({ leads, pipelines, rules }: { leads: Lead[]; pipelines: Pipeline[]; rules: DistributionRule[] }) {
  const activeLeads = leads.filter((lead) => lead.status !== "unfollowed");
  const poolLeads = leads.filter((lead) => !lead.assigned_to);
  const value = leads.reduce((sum, lead) => sum + Number(lead.value || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Active leads" value={activeLeads.length.toLocaleString()} icon={UserRound} />
        <Metric title="Pool leads" value={poolLeads.length.toLocaleString()} icon={Bell} />
        <Metric title="Pipelines" value={pipelines.length.toLocaleString()} icon={Boxes} />
        <Metric title="Total value" value={formatMoney(value)} icon={CircleDollarSign} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Latest leads">
          <LeadTable leads={leads.slice(0, 8)} onOpenLead={() => undefined} />
        </Panel>
        <Panel title="Distribution rules">
          <div className="space-y-2">
            {rules.slice(0, 6).map((rule) => (
              <div key={rule.id} className="rounded-md border border-slate-200 p-3">
                <div className="text-sm font-medium text-slate-900">{rule.facebook_pages?.name || "No page"}</div>
                <div className="mt-1 text-xs text-slate-500">{rule.pipelines?.name || "No pipeline"} · {rule.method}</div>
              </div>
            ))}
            {!rules.length ? <EmptyLine text="No rules yet" /> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function LeadsPanel({
  leads,
  filter,
  setFilter,
  profiles,
  onOpenLead,
  reload,
}: {
  leads: Lead[];
  filter: "active" | "unfollowed";
  setFilter: (filter: "active" | "unfollowed") => void;
  profiles: Profile[];
  onOpenLead: (lead: Lead) => void;
  reload: () => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-950">Leads</h1>
          <p className="text-sm text-slate-500">Click a lead to edit details, notes, tags, and reminders.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className={pillClass(filter === "active")} onClick={() => setFilter("active")}>Active</button>
          <button className={pillClass(filter === "unfollowed")} onClick={() => setFilter("unfollowed")}>Unfollowed</button>
          <IconButton label="Reload" icon={RefreshCcw} onClick={reload} />
        </div>
      </div>
      <LeadTable leads={leads} profiles={profiles} onOpenLead={onOpenLead} />
    </section>
  );
}

function FunnelBoard({
  stages,
  leads,
  draggedLeadId,
  setDraggedLeadId,
  onMoveLead,
  onOpenLead,
}: {
  stages: Stage[];
  leads: Lead[];
  draggedLeadId: string | null;
  setDraggedLeadId: (id: string | null) => void;
  onMoveLead: (leadId: string, stage: Stage) => Promise<void>;
  onOpenLead: (lead: Lead) => void;
}) {
  return (
    <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm scrollbar-thin">
      <div className="grid min-w-[640px] auto-cols-fr grid-flow-col gap-1.5">
        {stages.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.stage_id === stage.id);
          return (
            <div
              key={stage.id}
              className="min-w-[180px] rounded-md border border-slate-200 bg-slate-50"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedLeadId) void onMoveLead(draggedLeadId, stage);
                setDraggedLeadId(null);
              }}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-2 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="truncate text-sm font-semibold text-slate-900">{stage.name}</span>
                </div>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] text-slate-600">{stageLeads.length}</span>
              </div>
              <div className="space-y-1.5 p-1.5">
                {stageLeads.map((lead) => (
                  <button
                    key={lead.id}
                    draggable
                    onDragStart={() => setDraggedLeadId(lead.id)}
                    onClick={() => onOpenLead(lead)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm hover:border-brand-600"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <GripVertical size={13} className="shrink-0 text-slate-300" />
                      <div className="truncate text-[13px] font-medium text-slate-900">{lead.customer_name}</div>
                    </div>
                    <div className="mt-0.5 truncate pl-5 text-[11px] text-slate-500">{lead.phone || lead.email || "No contact"}</div>
                  </button>
                ))}
                {!stageLeads.length ? <EmptyLine text="Drop leads here" /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TeamsPanel({ teams, profiles, userId, reload, toast }: { teams: Team[]; profiles: Profile[]; userId: string; reload: () => Promise<void>; toast: (message: string) => void }) {
  const [name, setName] = useState("");
  const [memberByTeam, setMemberByTeam] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function createTeam() {
    if (!name.trim()) return toast("Team name is required");
    setBusy(true);
    try {
      const { data, error } = await supabase.from("teams").insert({ name: name.trim(), created_by: userId }).select("id,name").single();
      if (error) { toast(`Create team failed: ${error.message}`); return; }
      const memberResult = await supabase.from("team_members").insert({ team_id: data.id, user_id: userId, is_lead: true });
      setName("");
      await reload();
      toast(memberResult.error ? `Team created, but owner was not added: ${memberResult.error.message}` : "Team created");
    } catch (reloadError) {
      toast(reloadError instanceof Error ? reloadError.message : "Team created, but reload failed");
    } finally {
      setBusy(false);
    }
  }

  async function addMember(teamId: string) {
    const userIdToAdd = memberByTeam[teamId];
    if (!userIdToAdd) return;
    const { error } = await supabase.from("team_members").insert({ team_id: teamId, user_id: userIdToAdd, is_lead: false });
    if (error) return toast(error.message);
    setMemberByTeam((current) => ({ ...current, [teamId]: "" }));
    await reload();
  }

  return (
    <div className="space-y-4">
      <InlineCreate title="Create team" fields={<Field label="Team name" value={name} onChange={setName} />} onSubmit={createTeam} disabled={busy} />
      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((team) => (
          <section key={team.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-950">{team.name}</h2>
              <IconButton label="Delete team" icon={Trash2} onClick={async () => deleteRow("teams", team.id, reload, toast)} />
            </div>
            <div className="mt-3 space-y-2">
              {(team.team_members || []).map((member) => (
                <div key={member.user_id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                  <span className="text-sm text-slate-700">{member.profiles?.full_name || member.profiles?.email || member.user_id}</span>
                  <div className="flex items-center gap-2">
                    <button className="text-xs font-medium text-brand-700" onClick={() => toggleTeamLead(team.id, member.user_id, member.is_lead, reload, toast)}>
                      {member.is_lead ? "Lead" : "Make lead"}
                    </button>
                    <button className="text-xs text-rose-600" onClick={() => removeTeamMember(team.id, member.user_id, reload, toast)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <select className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" value={memberByTeam[team.id] || ""} onChange={(event) => setMemberByTeam((current) => ({ ...current, [team.id]: event.target.value }))}>
                <option value="">Add member</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>)}
              </select>
              <button className="rounded-lg bg-brand-700 px-3 text-sm font-medium text-white" onClick={() => addMember(team.id)}>Add</button>
            </div>
          </section>
        ))}
        {!teams.length ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 md:col-span-2">
            No teams yet. Create the first team above.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RulesPanel({
  rules,
  pages,
  teams,
  pipelines,
  profiles,
  reload,
  toast,
}: {
  rules: DistributionRule[];
  pages: Page[];
  teams: Team[];
  pipelines: Pipeline[];
  profiles: Profile[];
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const emptyRuleForm: RuleForm = { page_id: "", pipeline_id: "", assign_type: "team", team_id: "", user_id: "", method: "round_robin" };
  const [form, setForm] = useState<RuleForm>(emptyRuleForm);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RuleForm>(emptyRuleForm);
  const [busy, setBusy] = useState(false);

  async function createRule() {
    if (!form.page_id) return toast("Choose a page");
    const payload = buildRulePayload(form, toast);
    if (!payload) return;
    payload.is_active = true;
    setBusy(true);
    try {
      const { error } = await supabase.from("distribution_rules").insert(payload);
      if (error) { toast(error.message); return; }
      setForm(emptyRuleForm);
      await reload();
      toast("Rule created");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(rule: DistributionRule) {
    const userId = rule.config?.user_ids?.[0] || "";
    setEditingRuleId(rule.id);
    setEditForm({
      page_id: rule.page_id || "",
      pipeline_id: rule.pipeline_id || "",
      assign_type: userId ? "user" : "team",
      team_id: rule.team_id || "",
      user_id: userId,
      method: rule.method,
    });
  }

  async function saveRule(ruleId: string) {
    const payload = buildRulePayload(editForm, toast);
    if (!payload) return;
    const { error } = await supabase.from("distribution_rules").update(payload).eq("id", ruleId);
    if (error) return toast(error.message);
    setEditingRuleId(null);
    await reload();
    toast("Rule updated");
  }

  return (
    <Panel title="Distribution rules">
      <div className="mb-4 grid gap-2 lg:grid-cols-6">
        <Select label="Page" value={form.page_id} onChange={(value) => setForm({ ...form, page_id: value })} options={pages.map((page) => ({ value: page.id, label: page.name }))} />
        <Select label="Pipeline" value={form.pipeline_id} onChange={(value) => setForm({ ...form, pipeline_id: value })} options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))} allowEmpty />
        <Select label="Assign" value={form.assign_type} onChange={(value) => setForm({ ...form, assign_type: value })} options={[{ value: "team", label: "Team" }, { value: "user", label: "User" }]} />
        {form.assign_type === "team" ? (
          <Select label="Team" value={form.team_id} onChange={(value) => setForm({ ...form, team_id: value })} options={teams.map((team) => ({ value: team.id, label: team.name }))} />
        ) : (
          <Select label="User" value={form.user_id} onChange={(value) => setForm({ ...form, user_id: value })} options={profiles.map((profile) => ({ value: profile.id, label: profile.full_name || profile.email }))} />
        )}
        <Select label="Method" value={form.method} onChange={(value) => setForm({ ...form, method: value })} options={[{ value: "round_robin", label: "Round robin" }, { value: "random", label: "Random" }]} />
        <div className="flex items-end"><button className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={createRule}>{busy ? "Working…" : "Create"}</button></div>
      </div>
      <DataTable
        headers={["Page", "Pipeline", "Target", "Method", "Status", "Actions"]}
        rows={rules.map((rule) => {
          const isEditing = editingRuleId === rule.id;
          return [
            isEditing ? (
              <RuleCellSelect label="Page" value={editForm.page_id} onChange={(value) => setEditForm({ ...editForm, page_id: value })} options={pages.map((page) => ({ value: page.id, label: page.name }))} />
            ) : (
              rule.facebook_pages?.name || pages.find((page) => page.id === rule.page_id)?.name || "-"
            ),
            isEditing ? (
              <RuleCellSelect label="Pipeline" value={editForm.pipeline_id} onChange={(value) => setEditForm({ ...editForm, pipeline_id: value })} options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))} allowEmpty />
            ) : (
              rule.pipelines?.name || pipelines.find((pipeline) => pipeline.id === rule.pipeline_id)?.name || "-"
            ),
            isEditing ? (
              <div className="grid min-w-[260px] gap-2 sm:grid-cols-2">
                <RuleCellSelect label="Assign" value={editForm.assign_type} onChange={(value) => setEditForm({ ...editForm, assign_type: value })} options={[{ value: "team", label: "Team" }, { value: "user", label: "User" }]} />
                {editForm.assign_type === "team" ? (
                  <RuleCellSelect label="Team" value={editForm.team_id} onChange={(value) => setEditForm({ ...editForm, team_id: value })} options={teams.map((team) => ({ value: team.id, label: team.name }))} />
                ) : (
                  <RuleCellSelect label="User" value={editForm.user_id} onChange={(value) => setEditForm({ ...editForm, user_id: value })} options={profiles.map((profile) => ({ value: profile.id, label: profile.full_name || profile.email }))} />
                )}
              </div>
            ) : (
              rule.teams?.name || teams.find((team) => team.id === rule.team_id)?.name || userIdsLabel(rule.config?.user_ids, profiles)
            ),
            isEditing ? (
              <RuleCellSelect label="Method" value={editForm.method} onChange={(value) => setEditForm({ ...editForm, method: value })} options={[{ value: "round_robin", label: "Round robin" }, { value: "random", label: "Random" }]} />
            ) : (
              rule.method
            ),
            rule.is_active ? "Active" : "Off",
            isEditing ? (
              <div key={rule.id} className="flex gap-2">
                <IconButton label="Save rule" icon={Check} onClick={() => saveRule(rule.id)} />
                <IconButton label="Cancel edit" icon={X} onClick={() => setEditingRuleId(null)} />
              </div>
            ) : (
              <div key={rule.id} className="flex gap-2">
                <IconButton label="Edit rule" icon={Pencil} onClick={() => startEdit(rule)} />
                <RowActions
                  isActive={rule.is_active}
                  onToggle={() => toggleRule(rule, reload, toast)}
                  onDelete={() => deleteRow("distribution_rules", rule.id, reload, toast)}
                />
              </div>
            ),
          ];
        })}
      />
    </Panel>
  );
}

function buildRulePayload(form: RuleForm, toast: (message: string) => void) {
  if (!form.page_id) {
    toast("Choose a page");
    return null;
  }
  const payload: Record<string, unknown> = {
    page_id: form.page_id,
    pipeline_id: form.pipeline_id || null,
    team_id: null,
    method: form.method,
    config: {},
  };
  if (form.assign_type === "team") {
    if (!form.team_id) {
      toast("Choose a team");
      return null;
    }
    payload.team_id = form.team_id;
  } else {
    if (!form.user_id) {
      toast("Choose a user");
      return null;
    }
    payload.config = { user_ids: [form.user_id] };
  }
  return payload;
}

function RuleCellSelect({
  label,
  value,
  onChange,
  options,
  allowEmpty = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  return (
    <select
      aria-label={label}
      className="h-9 min-w-[150px] rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-brand-600"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {allowEmpty ? <option value="">None</option> : <option value="">Choose</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function RecallPanel({ rules, stages, leads, profiles: _profiles, userId: _userId, reload, toast }: { rules: RecallRule[]; stages: Stage[]; leads: Lead[]; profiles: Profile[]; userId: string; reload: () => Promise<void>; toast: (message: string) => void }) {
  const [form, setForm] = useState({ stage_id: "", inactive_days: "3", recall_to: "pool" });
  const [busy, setBusy] = useState(false);

  async function createRule() {
    if (!form.stage_id) return toast("Choose a stage");
    setBusy(true);
    try {
      const { error } = await supabase.from("auto_recall_rules").insert({
        stage_id: form.stage_id,
        inactive_days: Number(form.inactive_days || 3),
        recall_to: form.recall_to,
        is_active: true,
      });
      if (error) { toast(error.message); return; }
      setForm({ stage_id: "", inactive_days: "3", recall_to: "pool" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Auto recall">
      <div className="mb-4 grid gap-2 md:grid-cols-5">
        <Select label="Stage" value={form.stage_id} onChange={(value) => setForm({ ...form, stage_id: value })} options={stages.map((stage) => ({ value: stage.id, label: stage.name }))} />
        <Field label="Inactive days" value={form.inactive_days} onChange={(value) => setForm({ ...form, inactive_days: value })} type="number" />
        <Select label="Recall to" value={form.recall_to} onChange={(value) => setForm({ ...form, recall_to: value })} options={[{ value: "pool", label: "Pool" }, { value: "admin", label: "Admin" }, { value: "team", label: "Team" }]} />
        <div className="flex items-end"><button className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={createRule}>{busy ? "Working…" : "Create"}</button></div>
        <div className="flex items-end"><button className="h-10 w-full rounded-lg border border-slate-200 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={busy} onClick={() => runRecall(reload, toast)}>Run now</button></div>
      </div>
      <DataTable
        headers={["Stage", "Inactive", "Due now", "Recall to", "Status", "Actions"]}
        rows={rules.map((rule) => {
          const due = leads.filter((lead) => lead.stage_id === rule.stage_id && lead.status === "active" && lead.assigned_to && new Date(lead.last_activity_at).getTime() < Date.now() - rule.inactive_days * 86_400_000).length;
          return [
            rule.funnel_stages?.name || stages.find((stage) => stage.id === rule.stage_id)?.name || "-",
            `${rule.inactive_days} days`,
            due.toString(),
            rule.recall_to,
            rule.is_active ? "Active" : "Off",
            <RowActions key={rule.id} isActive={rule.is_active} onToggle={() => toggleBoolean("auto_recall_rules", rule.id, "is_active", !rule.is_active, reload, toast)} onDelete={() => deleteRow("auto_recall_rules", rule.id, reload, toast)} />,
          ];
        })}
      />
    </Panel>
  );
}

function StagesPanel({ stages, activePipelineId, leads, reload, toast }: { stages: Stage[]; activePipelineId: string; leads: Lead[]; reload: () => Promise<void>; toast: (message: string) => void }) {
  const [form, setForm] = useState({ name: "", color: "#2563eb", is_unfollow: false });
  const [busy, setBusy] = useState(false);
  const orderedStages = [...stages].sort((a, b) => a.position - b.position);

  async function createStage() {
    if (!activePipelineId) return toast("Select a pipeline first");
    if (!form.name.trim()) return toast("Stage name is required");
    setBusy(true);
    try {
      const nextPosition = orderedStages.length + 1;
      const { error } = await supabase.from("funnel_stages").insert({
        name: form.name.trim(),
        color: form.color,
        is_unfollow: form.is_unfollow,
        pipeline_id: activePipelineId,
        position: nextPosition,
      });
      if (error) { toast(error.message); return; }
      await normalizeStagePositions(activePipelineId);
      setForm({ name: "", color: "#2563eb", is_unfollow: false });
      await reload();
      toast("Stage created");
    } finally {
      setBusy(false);
    }
  }

  async function deleteStage(stage: Stage) {
    if (leads.some((lead) => lead.stage_id === stage.id)) return toast("Cannot delete a stage that still has leads");
    const ok = window.confirm(`Delete stage "${stage.name}"?`);
    if (!ok) return;
    const { error } = await supabase.from("funnel_stages").delete().eq("id", stage.id);
    if (error) return toast(error.message);
    await normalizeStagePositions(activePipelineId);
    await reload();
    toast("Stage deleted");
  }

  return (
    <Panel title="Funnel stages">
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_140px_120px]">
        <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="New stage name" />
        <Field label="Color" value={form.color} onChange={(value) => setForm({ ...form, color: value })} type="color" />
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.is_unfollow} onChange={(event) => setForm({ ...form, is_unfollow: event.target.checked })} />
          Unfollow
        </label>
        <div className="flex items-end"><button className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50" disabled={!activePipelineId || busy} onClick={createStage}>{busy ? "Working…" : "Create"}</button></div>
      </div>
      <div className="grid gap-2">
        {orderedStages.map((stage, index) => (
          <div key={stage.id} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[40px_1fr_96px_112px_132px]">
            <div className="text-sm text-slate-500">#{index + 1}</div>
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" defaultValue={stage.name} onBlur={(event) => updateStage(stage.id, { name: event.target.value }, reload, toast)} />
            <input className="h-10 rounded-lg border border-slate-200 px-2" type="color" defaultValue={stage.color} onChange={(event) => updateStage(stage.id, { color: event.target.value }, reload, toast)} />
            <button className="rounded-lg border border-slate-200 text-sm" onClick={() => updateStage(stage.id, { is_unfollow: !stage.is_unfollow }, reload, toast)}>{stage.is_unfollow ? "Unfollow" : "Active"}</button>
            <div className="flex items-center justify-end gap-1">
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
                title="Move up"
                aria-label={`Move ${stage.name} up`}
                disabled={index === 0}
                onClick={() => moveStage(orderedStages, index, -1, reload)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
                title="Move down"
                aria-label={`Move ${stage.name} down`}
                disabled={index === orderedStages.length - 1}
                onClick={() => moveStage(orderedStages, index, 1, reload)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent"
                title="Delete stage"
                aria-label={`Delete ${stage.name}`}
                disabled={leads.some((lead) => lead.stage_id === stage.id)}
                onClick={() => deleteStage(stage)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TagsPanel({ tags, userId, reload, toast }: { tags: Tag[]; userId: string; reload: () => Promise<void>; toast: (message: string) => void }) {
  const [form, setForm] = useState({ name: "", color: "#8b5cf6", type: "custom" });
  const [busy, setBusy] = useState(false);

  async function createTag() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("tags").insert({ ...form, name: form.name.trim(), created_by: userId });
      if (error) { toast(error.message); return; }
      setForm({ name: "", color: "#8b5cf6", type: "custom" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Tags">
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_160px_120px]">
        <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <Field label="Color" value={form.color} onChange={(value) => setForm({ ...form, color: value })} type="color" />
        <Select label="Type" value={form.type} onChange={(value) => setForm({ ...form, type: value })} options={[{ value: "custom", label: "Custom" }, { value: "system", label: "System" }]} />
        <div className="flex items-end"><button className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={createTag}>{busy ? "Working…" : "Create"}</button></div>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {tags.map((tag) => (
          <div key={tag.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
              <span className="text-sm font-medium text-slate-900">{tag.name}</span>
              <span className="text-xs text-slate-500">{tag.type}</span>
            </div>
            <button className="text-sm text-rose-600" onClick={() => deleteRow("tags", tag.id, reload, toast)}>Delete</button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PipelinePanel({
  pipelines,
  leads,
  userId,
  canManage,
  reload,
  toast,
  onManage,
}: {
  pipelines: Pipeline[];
  leads: Lead[];
  userId: string;
  canManage: boolean;
  reload: () => Promise<void>;
  toast: (message: string) => void;
  onManage: (id: string) => void;
}) {
  const [form, setForm] = useState({ name: "", description: "", color: "#2563eb" });
  const [busy, setBusy] = useState(false);

  async function createPipeline() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("pipelines").insert({ ...form, name: form.name.trim(), created_by: userId });
      if (error) { toast(error.message); return; }
      setForm({ name: "", description: "", color: "#2563eb" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <InlineCreate
          title="Create pipeline"
          fields={
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
              <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              <Field label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
              <Field label="Color" value={form.color} onChange={(value) => setForm({ ...form, color: value })} type="color" />
            </div>
          }
          onSubmit={createPipeline}
          disabled={busy}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {pipelines.map((pipeline) => (
          <section key={pipeline.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: pipeline.color }} />
                  <h2 className="font-semibold text-slate-950">{pipeline.name}</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">{pipeline.description || "No description"}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{leads.filter((lead) => lead.pipeline_id === pipeline.id).length} leads</span>
            </div>
            {canManage ? (
              <div className="mt-4 flex gap-2">
                <button className="h-10 flex-1 rounded-lg border border-slate-200 text-sm font-medium text-slate-700" onClick={() => onManage(pipeline.id)}>Manage</button>
                <button className="h-10 rounded-lg px-3 text-sm font-medium text-rose-600" onClick={() => deleteRow("pipelines", pipeline.id, reload, toast)}>Delete</button>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function PagesPanel({ pages, userId, reload, toast }: { pages: Page[]; userId: string; reload: () => Promise<void>; toast: (message: string) => void }) {
  const [form, setForm] = useState({ name: "", page_id: "", token: "" });
  const [busy, setBusy] = useState(false);

  async function createPage() {
    if (!form.name.trim() || !form.page_id.trim()) return toast("Page name and Page ID are required");
    setBusy(true);
    try {
      const { error } = await supabase.from("facebook_pages").insert({ ...form, owner_id: userId, is_active: true });
      if (error) { toast(error.message); return; }
      setForm({ name: "", page_id: "", token: "" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Facebook pages">
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_1fr_120px]">
        <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <Field label="Page ID" value={form.page_id} onChange={(value) => setForm({ ...form, page_id: value })} />
        <Field label="Page token" value={form.token} onChange={(value) => setForm({ ...form, token: value })} />
        <div className="flex items-end"><button className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={createPage}>{busy ? "Working…" : "Create"}</button></div>
      </div>
      <DataTable
        headers={["Name", "Page ID", "Status", "Actions"]}
        rows={pages.map((page) => [
          page.name,
          page.page_id,
          page.is_active ? "Active" : "Off",
          <RowActions key={page.id} isActive={page.is_active} onToggle={() => toggleBoolean("facebook_pages", page.id, "is_active", !page.is_active, reload, toast)} onDelete={() => deleteRow("facebook_pages", page.id, reload, toast)} />,
        ])}
      />
    </Panel>
  );
}

function StageChangeNoteModal({
  stageName,
  onCancel,
  onConfirm,
}: {
  stageName: string;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const trimmed = note.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-note-title"
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <MessageSquareText size={18} />
            </div>
            <div className="min-w-0">
              <h2 id="stage-note-title" className="font-semibold text-slate-950">Stage change note</h2>
              <p className="mt-1 text-sm text-slate-500">Moving this lead to <span className="font-medium text-slate-700">{stageName}</span></p>
            </div>
          </div>
          <button
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onCancel}
          >
            <X size={17} />
          </button>
        </div>

        <div className="p-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Required note</span>
            <textarea
              autoFocus
              className="mt-1 min-h-28 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="เช่น โทรติดต่อลูกค้าแล้ว / นัดเข้าชมวันที่ 16/6/2569"
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">ระบบจะบันทึกข้อความนี้ลง Activity ของลีด</p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
          >
            Confirm move
          </button>
        </div>
      </section>
    </div>
  );
}

function LeadDrawer({
  lead,
  detail,
  stages,
  profiles,
  tags,
  userId,
  requestStageChangeNote,
  onClose,
  reload,
  toast,
}: {
  lead: Lead;
  detail: LeadDetail;
  stages: Stage[];
  profiles: Profile[];
  tags: Tag[];
  userId: string;
  requestStageChangeNote: (stageName: string) => Promise<string | null>;
  onClose: () => void;
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [form, setForm] = useState({
    customer_name: lead.customer_name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    value: String(lead.value || 0),
    stage_id: lead.stage_id || "",
    assigned_to: lead.assigned_to || "",
  });
  const [note, setNote] = useState("");
  const [reminder, setReminder] = useState({ remind_at: "", note: "" });
  const [busy, setBusy] = useState(false);
  const currentActorName = actorName(userId, profiles);

  useEffect(() => {
    setForm({
      customer_name: lead.customer_name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      value: String(lead.value || 0),
      stage_id: lead.stage_id || "",
      assigned_to: lead.assigned_to || "",
    });
  // Depend only on lead.id: reset the form when a different lead is opened,
  // but don't clobber in-progress edits when Realtime pushes a partial update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  async function saveLead() {
    setBusy(true);
    try {
    const stage = stages.find((item) => item.id === form.stage_id);
    // Guard: prevent saving a stage that belongs to a different pipeline than the lead.
    // This can happen if the user switches the pipeline filter bar while the drawer is open.
    if (stage && lead.pipeline_id && stage.pipeline_id && stage.pipeline_id !== lead.pipeline_id) {
      toast("Stage ไม่ตรงกับ Pipeline ของลีดนี้ กรุณาเลือก Stage ใหม่");
      return;
    }
    const stageChanged = form.stage_id !== (lead.stage_id || "");
    const assigneeChanged = form.assigned_to !== (lead.assigned_to || "");
    const stageChangeNote = stageChanged ? await requestStageChangeNote(stage?.name || "selected stage") : null;
    if (stageChanged && !stageChangeNote) return;

    const { error } = await supabase
      .from("leads")
      .update({
        customer_name: form.customer_name,
        phone: form.phone || null,
        email: form.email || null,
        value: Number(form.value || 0),
        stage_id: form.stage_id || null,
        assigned_to: form.assigned_to || null,
        status: stage?.is_unfollow ? "unfollowed" : "active",
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
    if (error) return toast(error.message);
    const activities: { lead_id: string; type: string; content: string; created_by: string }[] = [];
    if (stageChanged) {
      activities.push({
        lead_id: lead.id,
        type: "stage_change",
        content: `${currentActorName} moved lead to ${stage?.name || "new stage"}: ${stageChangeNote}`,
        created_by: userId,
      });
    }
    if (assigneeChanged) {
      const nextAssignee = actorName(form.assigned_to, profiles);
      const previousAssignee = lead.assigned_to ? actorName(lead.assigned_to, profiles) : "central pool";
      activities.push({
        lead_id: lead.id,
        type: "assigned",
        content: form.assigned_to
          ? `${currentActorName} assigned lead from ${previousAssignee} to ${nextAssignee}`
          : `${currentActorName} returned lead from ${previousAssignee} to central pool`,
        created_by: userId,
      });
    }
    if (!activities.length) {
      activities.push({ lead_id: lead.id, type: "note", content: `${currentActorName} updated lead details`, created_by: userId });
    }
    await supabase.from("lead_activities").insert(activities);
    await reload();
    toast("Lead saved");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("lead_activities").insert({ lead_id: lead.id, type: "note", content: note.trim(), created_by: userId });
      if (error) { toast(error.message); return; }
      setNote("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveReminder() {
    if (!reminder.remind_at) return toast("Choose reminder time");
    setBusy(true);
    try {
      const { error } = await supabase.from("lead_reminders").insert({
        lead_id: lead.id,
        remind_at: reminder.remind_at,
        note: reminder.note || null,
        created_by: userId,
      });
      if (error) { toast(error.message); return; }
      setReminder({ remind_at: "", note: "" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30">
      <aside className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{lead.customer_name}</h2>
            <p className="text-sm text-slate-500">{lead.page?.name || "No page"} · {recallCountdownText(lead, stages)}</p>
          </div>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={onClose}>Close</button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 scrollbar-thin">
          <section className="grid gap-3 md:grid-cols-2">
            <Field label="Customer name" value={form.customer_name} onChange={(value) => setForm({ ...form, customer_name: value })} />
            <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
            <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} type="email" />
            <Field label="Value" value={form.value} onChange={(value) => setForm({ ...form, value })} type="number" />
            <Select label="Stage" value={form.stage_id} onChange={(value) => setForm({ ...form, stage_id: value })} options={stages.map((stage) => ({ value: stage.id, label: stage.name }))} allowEmpty />
            <Select label="Assignee" value={form.assigned_to} onChange={(value) => setForm({ ...form, assigned_to: value })} options={profiles.map((profile) => ({ value: profile.id, label: profile.full_name || profile.email }))} allowEmpty emptyLabel="Pool" />
            <button className="h-10 rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50 md:col-span-2" disabled={busy} onClick={saveLead}>{busy ? "Saving…" : "Save lead"}</button>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-950">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const active = Boolean(lead.lead_tags?.some((item) => item.tag_id === tag.id));
                return (
                  <button key={tag.id} className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "text-white" : "border border-slate-200 text-slate-700"}`} style={{ backgroundColor: active ? tag.color : "white" }} onClick={() => toggleLeadTag(lead.id, tag.id, active, reload, toast)}>
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-950">Notes</h3>
            <div className="flex gap-2">
              <input className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add note" />
              <button className="rounded-lg bg-brand-700 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={addNote}>Add</button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-950">Reminders</h3>
            <div className="grid gap-2 md:grid-cols-[180px_1fr_90px]">
              <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" type="datetime-local" value={reminder.remind_at} onChange={(event) => setReminder({ ...reminder, remind_at: event.target.value })} />
              <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={reminder.note} onChange={(event) => setReminder({ ...reminder, note: event.target.value })} placeholder="Reminder note" />
              <button className="rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={saveReminder}>Save</button>
            </div>
            <div className="mt-2 space-y-2">
              {detail.reminders.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span>{new Date(item.remind_at).toLocaleString("th-TH")} · {item.note || "Reminder"}</span>
                  <button className="text-rose-600" onClick={() => deleteRow("lead_reminders", item.id, reload, toast)}>Delete</button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-950">Activity</h3>
            <div className="space-y-2">
              {detail.activities.map((activity) => (
                <div key={activity.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MessageSquareText size={14} />
                    {actorName(activity.created_by, profiles)} ·
                    {activity.type} · {new Date(activity.created_at).toLocaleString("th-TH")}
                  </div>
                  <div className="mt-1 text-sm text-slate-800">{activity.content || "-"}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function PipelineManagementModal({
  pipeline,
  stages,
  recallRules,
  teams,
  profiles,
  leads,
  userId,
  reload,
  toast,
  onClose,
}: {
  pipeline: Pipeline;
  stages: Stage[];
  recallRules: RecallRule[];
  teams: Team[];
  profiles: Profile[];
  leads: Lead[];
  userId: string;
  reload: () => Promise<void>;
  toast: (message: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"stages" | "recall" | "members">("stages");
  const [addTeamId, setAddTeamId] = useState("");
  const [addUserId, setAddUserId] = useState("");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-4">
      <section className="flex max-h-[90dvh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Manage {pipeline.name}</h2>
            <p className="text-sm text-slate-500">Stages, recall rules, teams, and direct users.</p>
          </div>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={onClose}>Close</button>
        </div>
        <div className="flex gap-2 border-b border-slate-200 p-3">
          {(["stages", "recall", "members"] as const).map((item) => (
            <button key={item} className={pillClass(tab === item)} onClick={() => setTab(item)}>{item}</button>
          ))}
        </div>
        <div className="overflow-y-auto p-4">
          {tab === "stages" ? <StagesPanel stages={stages} activePipelineId={pipeline.id} leads={leads.filter((lead) => stages.some((stage) => stage.id === lead.stage_id))} reload={reload} toast={toast} /> : null}
          {tab === "recall" ? <RecallPanel rules={recallRules.filter((rule) => stages.some((stage) => stage.id === rule.stage_id))} stages={stages} leads={leads.filter((lead) => stages.some((stage) => stage.id === lead.stage_id))} profiles={profiles} userId={userId} reload={reload} toast={toast} /> : null}
          {tab === "members" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 font-semibold">Teams</h3>
                <div className="flex gap-2">
                  <select className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" value={addTeamId} onChange={(event) => setAddTeamId(event.target.value)}>
                    <option value="">Choose team</option>
                    {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                  <button className="rounded-lg bg-brand-700 px-3 text-sm font-medium text-white" onClick={() => addPipelineTeam(pipeline.id, addTeamId, reload, toast, () => setAddTeamId(""))}>Add</button>
                </div>
                <div className="mt-3 space-y-2">
                  {(pipeline.pipeline_teams || []).map((item) => (
                    <div key={item.team_id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                      {item.teams?.name || teams.find((team) => team.id === item.team_id)?.name || item.team_id}
                      <button className="text-rose-600" onClick={() => removePipelineTeam(pipeline.id, item.team_id, reload, toast)}>Remove</button>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 font-semibold">Direct users</h3>
                <div className="flex gap-2">
                  <select className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" value={addUserId} onChange={(event) => setAddUserId(event.target.value)}>
                    <option value="">Choose user</option>
                    {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>)}
                  </select>
                  <button className="rounded-lg bg-brand-700 px-3 text-sm font-medium text-white" onClick={() => addPipelineUser(pipeline.id, addUserId, reload, toast, () => setAddUserId(""))}>Add</button>
                </div>
                <div className="mt-3 space-y-2">
                  {(pipeline.pipeline_users || []).map((item) => (
                    <div key={item.user_id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                      {item.profiles?.full_name || item.profiles?.email || profiles.find((profile) => profile.id === item.user_id)?.email || item.user_id}
                      <button className="text-rose-600" onClick={() => removePipelineUser(pipeline.id, item.user_id, reload, toast)}>Remove</button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function LeadTable({ leads, profiles = [], onOpenLead }: { leads: Lead[]; profiles?: Profile[]; onOpenLead: (lead: Lead) => void }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-3">Customer</th>
            <th className="px-3 py-3">Contact</th>
            <th className="px-3 py-3">Stage</th>
            <th className="px-3 py-3">Assignee</th>
            <th className="px-3 py-3">Value</th>
            <th className="px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {leads.map((lead) => (
            <tr key={lead.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpenLead(lead)}>
              <td className="px-3 py-3 font-medium text-slate-950">{lead.customer_name}</td>
              <td className="px-3 py-3 text-slate-600">{lead.phone || lead.email || "-"}</td>
              <td className="px-3 py-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lead.stage?.color || "#94a3b8" }} />
                  {lead.stage?.name || "-"}
                </span>
              </td>
              <td className="px-3 py-3 text-slate-600">{lead.assigned?.full_name || lead.assigned?.email || profiles.find((item) => item.id === lead.assigned_to)?.full_name || "Pool"}</td>
              <td className="px-3 py-3 tabular-nums text-slate-700">{formatMoney(Number(lead.value || 0))}</td>
              <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${lead.status === "active" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{lead.status}</span></td>
            </tr>
          ))}
          {!leads.length ? <tr><td colSpan={6}><EmptyLine text="No leads in this view" /></td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600" type={type} value={value} autoComplete={autoComplete} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options, allowEmpty = false, emptyLabel = "None" }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; allowEmpty?: boolean; emptyLabel?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <select className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600" value={value} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">{emptyLabel}</option> : <option value="">Choose</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function InlineCreate({ title, fields, onSubmit, disabled }: { title: string; fields: React.ReactNode; onSubmit: () => void; disabled?: boolean }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-950">{title}</h2>
      <div className="grid gap-3 md:grid-cols-[1fr_120px]">
        {fields}
        <div className="flex items-end"><button className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50" disabled={disabled} onClick={onSubmit}>{disabled ? "Working…" : "Create"}</button></div>
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><h1 className="mb-4 text-lg font-semibold text-slate-950">{title}</h1>{children}</section>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 scrollbar-thin">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200">{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3">{cell}</td>)}</tr>)}</tbody>
      </table>
      {!rows.length ? <EmptyLine text="No records" /> : null}
    </div>
  );
}

function RowActions({ onToggle, onDelete, isActive }: { onToggle: () => void; onDelete: () => void; isActive?: boolean }) {
  const ToggleIcon = isActive === false ? PowerOff : Power;
  return (
    <div className="flex items-center gap-1.5">
      <ActionIconButton
        label={isActive === false ? "Turn on" : "Turn off"}
        icon={ToggleIcon}
        tone={isActive === false ? "muted" : "success"}
        onClick={onToggle}
      />
      <ActionIconButton label="Delete" icon={Trash2} tone="danger" onClick={onDelete} />
    </div>
  );
}

function IconButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label={label} onClick={onClick}><Icon size={16} /></button>;
}

function ActionIconButton({
  label,
  icon: Icon,
  tone = "default",
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "danger" | "muted";
  onClick: () => void;
}) {
  const toneClass = {
    default: "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 focus:ring-slate-200",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 focus:ring-emerald-200",
    danger: "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 focus:ring-rose-200",
    muted: "border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 hover:bg-slate-100 focus:ring-slate-200",
  }[tone];

  return (
    <button
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${toneClass}`}
      onClick={onClick}
    >
      <Icon size={16} strokeWidth={2.2} />
    </button>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: string; icon: LucideIcon }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between"><span className="text-sm text-slate-500">{title}</span><Icon size={18} className="text-brand-700" /></div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{value}</div>
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="p-4 text-center text-sm text-slate-400">{text}</div>;
}

function FullScreenState({ title, description }: { title: string; description: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4 text-center">
      <div><div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-lg bg-brand-700" /><h1 className="font-semibold text-slate-950">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div>
    </main>
  );
}

async function bootstrap(userId: string, email: string, setProfile: (profile: Profile | null) => void, setData: (data: AppData) => void, toast: (message: string) => void) {
  // Profile is created by the handle_new_user DB trigger on signup.
  // We only read it here — never write role from the client.
  const { data: profile, error: profileError } = await supabase.from("profiles").select("id,email,full_name,role").eq("id", userId).single();
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

async function loadCrmData(client: SupabaseClient, opts?: { role?: Role; userId?: string }): Promise<AppData> {
  // RLS is the authoritative visibility gate. For staff, we also filter at the
  // query level as defense-in-depth so their browser never receives other users' leads.
  let leadsQuery = client
    .from("leads")
    .select("*, stage:funnel_stages(*), page:facebook_pages(id,page_id,name,is_active), assigned:profiles!leads_assigned_to_fkey(id,email,full_name,role), lead_tags(tag_id, tags(id,name,color,type,created_by))")
    .order("created_at", { ascending: false })
    .limit(500);

  if (opts?.role === "staff" && opts?.userId) {
    leadsQuery = leadsQuery.or(`assigned_to.eq.${opts.userId},assigned_to.is.null`);
  }

  const [leads, stages, pipelines, pages, teams, profiles, rules, recallRules, tags] = await Promise.all([
    leadsQuery,
    client.from("funnel_stages").select("*").order("position"),
    client.from("pipelines").select("*, pipeline_teams(team_id, teams(name)), pipeline_users(user_id, profiles(id,email,full_name,role))").eq("is_active", true).order("created_at"),
    client.from("facebook_pages").select("id,page_id,name,is_active").order("created_at", { ascending: false }),
    client.from("teams").select("*, team_members(user_id,is_lead,profiles(id,email,full_name,role))").order("created_at"),
    client.from("profiles").select("id,email,full_name,role"),
    client.from("distribution_rules").select("*, teams(name), facebook_pages(name), pipelines(name,color)").order("created_at", { ascending: false }),
    client.from("auto_recall_rules").select("*, funnel_stages(name)").order("created_at", { ascending: false }),
    client.from("tags").select("*").order("created_at"),
  ]);

  const queryResults = { leads, stages, pipelines, pages, teams, profiles, rules, recallRules, tags };
  for (const [name, result] of Object.entries(queryResults)) {
    if (result.error) {
      throw new Error(`Load ${name} failed: ${result.error.message}`);
    }
  }

  return {
    leads: (leads.data || []) as Lead[],
    stages: (stages.data || []) as Stage[],
    pipelines: (pipelines.data || []) as Pipeline[],
    pages: (pages.data || []) as Page[],
    teams: (teams.data || []) as Team[],
    profiles: (profiles.data || []) as Profile[],
    rules: (rules.data || []) as DistributionRule[],
    recallRules: (recallRules.data || []) as RecallRule[],
    tags: (tags.data || []) as Tag[],
  };
}

async function loadLeadDetail(leadId: string): Promise<LeadDetail> {
  const [activities, reminders] = await Promise.all([
    supabase.from("lead_activities").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(60),
    supabase.from("lead_reminders").select("*").eq("lead_id", leadId).eq("is_done", false).order("remind_at"),
  ]);
  return { activities: (activities.data || []) as Activity[], reminders: (reminders.data || []) as Reminder[] };
}

async function simulateLead(data: AppData, activePipelineId: string, userId: string, setData: (data: AppData) => void, toast: (message: string) => void) {
  if (!data.pages.length || !data.stages.length) return toast("Create a page and stage first");
  const activeRules = data.rules.filter((rule) => rule.is_active);
  const selectedRule = activeRules.find((rule) => activePipelineId && rule.pipeline_id === activePipelineId) || activeRules.find((rule) => rule.pipeline_id) || activeRules[0];
  const page = data.pages.find((item) => item.id === selectedRule?.page_id) || data.pages[0];
  const pipelineId = activePipelineId || selectedRule?.pipeline_id || null;
  const stage = data.stages.filter((item) => (pipelineId ? item.pipeline_id === pipelineId : !item.pipeline_id) && !item.is_unfollow).sort((a, b) => a.position - b.position)[0] || data.stages.find((item) => !item.is_unfollow);
  const names = ["สมชาย ใจดี", "นภา สุขใจ", "วิชัย มานะ", "กัญญา สวัสดี", "ลูกค้าทดสอบ"];
  const { data: lead, error } = await supabase.from("leads").insert({
    customer_name: names[Math.floor(Math.random() * names.length)],
    facebook_id: `fb_${Math.floor(Math.random() * 1_000_000_000)}`,
    page_id: page.id,
    pipeline_id: pipelineId,
    stage_id: stage?.id,
    status: "active",
    source: "facebook",
    last_activity_at: new Date().toISOString(),
  }).select().single();
  if (error) return toast(error.message);
  await supabase.from("lead_activities").insert({ lead_id: lead.id, type: "created", content: `${actorName(userId, data.profiles)} created test lead from ${page.name}`, created_by: userId });
  // Trigger distribution so round-robin index advances and assignee/stage are set by server rules.
  await supabase.rpc("distribute_lead", { p_lead_id: lead.id });
  setData(await loadCrmData(supabase));
  toast("Lead simulated");
}

async function updateLeadStage(
  leadId: string,
  stage: Stage,
  userId: string,
  actorLabel: string,
  requestStageChangeNote: (stageName: string) => Promise<string | null>,
  toast: (message: string) => void,
) {
  const note = await requestStageChangeNote(stage.name);
  if (!note) return false;
  const { error } = await supabase.from("leads").update({ stage_id: stage.id, status: stage.is_unfollow ? "unfollowed" : "active", last_activity_at: new Date().toISOString() }).eq("id", leadId);
  if (error) {
    toast(error.message);
    return false;
  }
  await supabase.from("lead_activities").insert({ lead_id: leadId, type: "stage_change", content: `${actorLabel} moved lead to ${stage.name}: ${note}`, created_by: userId });
  return true;
}

async function runRecall(reload: () => Promise<void>, toast: (message: string) => void) {
  // Delegate to the server-side RPC so the UPDATE + activity inserts run in one transaction.
  const { data, error } = await supabase.rpc("recall_inactive_leads");
  if (error) return toast(error.message);
  await reload();
  toast(`Recalled ${data ?? 0} leads`);
}

async function checkReminders(userId: string, toast: (message: string) => void, reloadSelectedLead: () => Promise<void>) {
  const { data } = await supabase.from("lead_reminders").select("*, leads(customer_name)").eq("created_by", userId).eq("is_done", false).lte("remind_at", new Date().toISOString()).limit(10);
  const due = (data || []) as Reminder[];
  if (!due.length) return;
  // Show all toasts first, then batch-mark done, then reload once.
  due.forEach((r) => toast(`Reminder: ${r.leads?.customer_name || "Lead"} ${r.note || ""}`.trim()));
  await Promise.all(due.map((r) => supabase.from("lead_reminders").update({ is_done: true }).eq("id", r.id)));
  await reloadSelectedLead();
}

async function toggleLeadTag(leadId: string, tagId: string, active: boolean, reload: () => Promise<void>, toast: (message: string) => void) {
  const result = active
    ? await supabase.from("lead_tags").delete().match({ lead_id: leadId, tag_id: tagId })
    : await supabase.from("lead_tags").insert({ lead_id: leadId, tag_id: tagId });
  if (result.error) return toast(result.error.message);
  await reload();
}

async function updateStage(id: string, patch: Partial<Stage>, reload: () => Promise<void>, toast: (message: string) => void) {
  const { error } = await supabase.from("funnel_stages").update(patch).eq("id", id);
  if (error) return toast(error.message);
  await reload();
}

async function normalizeStagePositions(pipelineId: string) {
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

async function moveStage(stages: Stage[], index: number, dir: number, reload: () => Promise<void>) {
  const current = stages[index];
  const other = stages[index + dir];
  if (!current || !other) return;
  // Swap just the two affected positions — no need to renumber every stage.
  await Promise.all([
    supabase.from("funnel_stages").update({ position: other.position }).eq("id", current.id),
    supabase.from("funnel_stages").update({ position: current.position }).eq("id", other.id),
  ]);
  await reload();
}

async function toggleRule(rule: DistributionRule, reload: () => Promise<void>, toast: (message: string) => void) {
  await toggleBoolean("distribution_rules", rule.id, "is_active", !rule.is_active, reload, toast);
}

type ToggleableTable = "distribution_rules" | "auto_recall_rules" | "facebook_pages";
type DeletableTable = "distribution_rules" | "auto_recall_rules" | "facebook_pages" | "lead_reminders" | "tags" | "pipelines" | "teams";

async function toggleBoolean(table: ToggleableTable, id: string, field: string, value: boolean, reload: () => Promise<void>, toast: (message: string) => void) {
  const { error } = await supabase.from(table).update({ [field]: value }).eq("id", id);
  if (error) return toast(error.message);
  await reload();
}

async function deleteRow(table: DeletableTable, id: string, reload: () => Promise<void>, toast: (message: string) => void) {
  const ok = window.confirm("Delete this item? This action cannot be undone.");
  if (!ok) return;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return toast(error.message);
  await reload();
  toast("Deleted");
}

async function removeTeamMember(teamId: string, userId: string, reload: () => Promise<void>, toast: (message: string) => void) {
  const { error } = await supabase.from("team_members").delete().match({ team_id: teamId, user_id: userId });
  if (error) return toast(error.message);
  await reload();
}

async function toggleTeamLead(teamId: string, userId: string, isLead: boolean, reload: () => Promise<void>, toast: (message: string) => void) {
  const { error } = await supabase.from("team_members").update({ is_lead: !isLead }).match({ team_id: teamId, user_id: userId });
  if (error) return toast(error.message);
  await reload();
}

async function addPipelineTeam(pipelineId: string, teamId: string, reload: () => Promise<void>, toast: (message: string) => void, done: () => void) {
  if (!teamId) return;
  const { error } = await supabase.from("pipeline_teams").insert({ pipeline_id: pipelineId, team_id: teamId });
  if (error) return toast(error.message);
  done();
  await reload();
}

async function removePipelineTeam(pipelineId: string, teamId: string, reload: () => Promise<void>, toast: (message: string) => void) {
  const { error } = await supabase.from("pipeline_teams").delete().match({ pipeline_id: pipelineId, team_id: teamId });
  if (error) return toast(error.message);
  await reload();
}

async function addPipelineUser(pipelineId: string, userId: string, reload: () => Promise<void>, toast: (message: string) => void, done: () => void) {
  if (!userId) return;
  const { error } = await supabase.from("pipeline_users").insert({ pipeline_id: pipelineId, user_id: userId });
  if (error) return toast(error.message);
  done();
  await reload();
}

async function removePipelineUser(pipelineId: string, userId: string, reload: () => Promise<void>, toast: (message: string) => void) {
  const { error } = await supabase.from("pipeline_users").delete().match({ pipeline_id: pipelineId, user_id: userId });
  if (error) return toast(error.message);
  await reload();
}

function segmentClass(active: boolean) {
  return `h-9 rounded-md text-sm font-medium ${active ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;
}

function pillClass(active: boolean) {
  return `inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ${active ? "bg-brand-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
}

function roleLabel(role?: Role) {
  if (role === "admin") return "Admin";
  if (role === "team_lead") return "Team lead";
  return "Staff";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

function userIdsLabel(ids: string[] | undefined, profiles: Profile[]) {
  if (!ids?.length) return "-";
  return ids.map((id) => profiles.find((profile) => profile.id === id)?.full_name || profiles.find((profile) => profile.id === id)?.email || id).join(", ");
}

function actorName(userId: string | null | undefined, profiles: Profile[]) {
  if (!userId) return "CRM";
  const profile = profiles.find((item) => item.id === userId);
  return profile?.full_name || profile?.email || userId;
}

function recallCountdownText(lead: Lead, stages: Stage[]) {
  const stage = stages.find((item) => item.id === lead.stage_id);
  if (!stage || lead.status === "unfollowed") return "No recall countdown";
  return `Last activity ${new Date(lead.last_activity_at).toLocaleString("th-TH")}`;
}
