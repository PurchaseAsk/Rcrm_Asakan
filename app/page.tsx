"use client";

// This page requires auth and a live Supabase connection — skip static prerendering.
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BellRing,
  BookUser,
  Boxes,
  Clock,
  Inbox,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
  Split,
  Tags,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Profile } from "@/types/crm";
import type { AppData, LeadDetail, StageNoteRequest, TabId } from "@/types/app";
import { emptyData } from "@/types/app";
import {
  actorName,
  bootstrap,
  checkReminders,
  loadCrmData,
  loadLeadDetail,
  roleLabel,
  simulateLead,
  updateLeadStage,
} from "@/lib/helpers";

import { ChatInbox } from "@/components/ChatInbox";
import { CustomersPanel } from "@/components/CustomersPanel";
import { Dashboard } from "@/components/Dashboard";
import { FunnelBoard } from "@/components/FunnelBoard";
import { LeadDrawer } from "@/components/LeadDrawer";
import { LeadsPanel } from "@/components/LeadsPanel";
import { LoginScreen } from "@/components/LoginScreen";
import { PagesPanel } from "@/components/PagesPanel";
import { PipelineBar } from "@/components/PipelineBar";
import { PipelineManagementModal } from "@/components/PipelineManagementModal";
import { PipelinePanel } from "@/components/PipelinePanel";
import { RecallPanel } from "@/components/RecallPanel";
import { RemindersTab } from "@/components/RemindersTab";
import { RulesPanel } from "@/components/RulesPanel";
import { StageChangeNoteModal } from "@/components/StageChangeNoteModal";
import { StagesPanel } from "@/components/StagesPanel";
import { MyTagsPanel } from "@/components/MyTagsPanel";
import { TagsPanel } from "@/components/TagsPanel";
import { TeamsPanel } from "@/components/TeamsPanel";
import { FullScreenState } from "@/components/ui/FullScreenState";
import { Panel } from "@/components/ui/Panel";

const mainTabs: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "leads", label: "Leads", icon: UserRound },
  { id: "funnel", label: "Funnel", icon: Split },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "reminders", label: "Reminders", icon: BellRing },
  { id: "my-tags", label: "แท็กของฉัน", icon: Tags },
];

const settingsTabs: { id: TabId; label: string; icon: LucideIcon; managerOnly?: boolean }[] = [
  { id: "customers", label: "ทะเบียนลูกค้า", icon: BookUser },
  { id: "teams", label: "Teams", icon: Users },
  { id: "pipelines", label: "Pipelines", icon: Boxes },
  { id: "stages", label: "Stages", icon: Workflow, managerOnly: true },
  { id: "rules", label: "Rules", icon: Settings, managerOnly: true },
  { id: "recall", label: "Recall", icon: Clock, managerOnly: true },
  { id: "tags", label: "Global Tags", icon: Tags, managerOnly: true },
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
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetail, setLeadDetail] = useState<LeadDetail>({ activities: [], reminders: [] });
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [managingPipelineId, setManagingPipelineId] = useState<string | null>(null);
  const [stageNoteRequest, setStageNoteRequest] = useState<StageNoteRequest | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Ref so Realtime and reminder callbacks always read the latest leadId
  // without causing channel teardown on every lead open (H-2)
  const selectedLeadIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedLeadIdRef.current = selectedLeadId;
  }, [selectedLeadId]);

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

    const activeStillExists =
      activePipelineId === "__no_pipeline__" ||
      data.pipelines.some((pipeline) => pipeline.id === activePipelineId);
    if (!activeStillExists) {
      setActivePipelineId(data.pipelines[0].id);
    }
  }, [activePipelineId, data.pipelines]);

  const visibleSettingsTabs = settingsTabs.filter((tab) => !tab.managerOnly || canManage);
  const isSettingsTab = visibleSettingsTabs.some((t) => t.id === activeTab);

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

  // Profiles that the current user can filter leads by (admin/team_lead only)
  const filterableProfiles = useMemo(() => {
    if (!profile || !currentUserId) return [];
    if (profile.role === "admin") return data.profiles;
    if (profile.role === "team_lead") {
      const memberIds = new Set(myTeamMemberIds);
      return data.profiles.filter((p) => memberIds.has(p.id));
    }
    return [];
  }, [currentUserId, data.profiles, myTeamMemberIds, profile]);

  const visibleLeads = useMemo(() => {
    if (!profile || !currentUserId) return [];

    let scoped = data.leads;
    if (activePipelineId === "__no_pipeline__") {
      scoped = data.leads.filter((lead) => !lead.pipeline_id);
    } else if (activePipelineId) {
      scoped = data.leads.filter((lead) => lead.pipeline_id === activePipelineId);
    }

    // Staff always sees only own + pool
    if (profile.role === "staff") {
      return scoped.filter((lead) => !lead.assigned_to || lead.assigned_to === currentUserId);
    }
    // Team lead sees own team + pool
    if (profile.role === "team_lead") {
      return scoped.filter(
        (lead) =>
          !lead.assigned_to ||
          lead.assigned_to === currentUserId ||
          myTeamMemberIds.includes(lead.assigned_to),
      );
    }
    // Admin sees all
    return scoped;
  }, [activePipelineId, currentUserId, data.leads, myTeamMemberIds, profile]);

  const pipelineStages = useMemo(() => {
    if (!activePipelineId || activePipelineId === "__no_pipeline__") {
      return data.stages.filter((stage) => !stage.pipeline_id);
    }
    const scoped = data.stages.filter((stage) => stage.pipeline_id === activePipelineId);
    return scoped.length ? scoped : data.stages.filter((stage) => !stage.pipeline_id);
  }, [activePipelineId, data.stages]);

  const editablePipelineStages = useMemo(() => {
    if (!activePipelineId || activePipelineId === "__no_pipeline__") return [];
    return data.stages.filter((stage) => stage.pipeline_id === activePipelineId);
  }, [activePipelineId, data.stages]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleLeads.filter((lead) => {
      const byStatus =
        leadFilter === "unfollowed" ? lead.status === "unfollowed" : lead.status !== "unfollowed";
      if (!byStatus) return false;
      if (assigneeFilter === "__pool__") { if (lead.assigned_to) return false; }
      else if (assigneeFilter && lead.assigned_to !== assigneeFilter) return false;
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
  }, [assigneeFilter, leadFilter, search, visibleLeads]);

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

  async function openLead(lead: import("@/types/crm").Lead) {
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
              <div className="text-sm font-semibold leading-tight text-slate-950">AsakanLeadFlow</div>
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
            {mainTabs.map((item) => {
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

            {/* Settings collapsible group */}
            <div className="col-span-2 lg:col-span-1">
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition ${
                  isSettingsTab ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <Settings size={17} />
                <span className="flex-1">ตั้งค่า</span>
                <svg
                  className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {(settingsOpen || isSettingsTab) && (
                <div className="mt-0.5 ml-2 grid grid-cols-1 gap-0.5 border-l-2 border-slate-100 pl-2">
                  {visibleSettingsTabs.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium transition ${
                          active ? "bg-brand-700 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                      >
                        <Icon size={15} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </aside>

        <section className={`min-w-0 ${activeTab === "inbox" ? "" : "space-y-4"}`}>
          {activeTab !== "inbox" && (
            <>
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
            </>
          )}

          {activeTab !== "inbox" && (
            <PipelineBar
              pipelines={data.pipelines}
              activePipelineId={activePipelineId}
              onChange={setActivePipelineId}
            />
          )}

          {activeTab === "dashboard" && (
            <Dashboard
              leads={visibleLeads}
              pipelineStages={pipelineStages}
              profiles={data.profiles}
            />
          )}
          {activeTab === "leads" && (
            <LeadsPanel
              leads={filteredLeads}
              filter={leadFilter}
              setFilter={setLeadFilter}
              profiles={data.profiles}
              filterableProfiles={filterableProfiles}
              assigneeFilter={assigneeFilter}
              setAssigneeFilter={setAssigneeFilter}
              onOpenLead={openLead}
              reload={reload}
              pipelines={data.pipelines}
              stages={data.stages}
              search={search}
              setSearch={setSearch}
            />
          )}
          {activeTab === "funnel" && (
            <FunnelBoard
              stages={pipelineStages.filter((s) => !s.is_unfollow)}
              leads={filteredLeads}
              draggedLeadId={draggedLeadId}
              setDraggedLeadId={setDraggedLeadId}
              filterableProfiles={filterableProfiles}
              assigneeFilter={assigneeFilter}
              setAssigneeFilter={setAssigneeFilter}
              onMoveLead={async (leadId, stage) => {
                const moved = await updateLeadStage(
                  leadId,
                  stage,
                  currentUserId,
                  actorName(currentUserId, data.profiles),
                  requestStageChangeNote,
                  showToast,
                );
                if (moved) await reload();
              }}
              onOpenLead={openLead}
            />
          )}
          {activeTab === "teams" && (
            <TeamsPanel
              teams={data.teams}
              profiles={data.profiles}
              userId={currentUserId}
              reload={reload}
              toast={showToast}
            />
          )}
          {activeTab === "rules" && canManage && (
            <RulesPanel
              rules={data.rules}
              pages={data.pages}
              teams={data.teams}
              pipelines={data.pipelines}
              profiles={data.profiles}
              reload={reload}
              toast={showToast}
            />
          )}
          {activeTab === "recall" && canManage && (
            <RecallPanel
              rules={data.recallRules}
              stages={data.stages}
              leads={data.leads}
              profiles={data.profiles}
              userId={currentUserId}
              reload={reload}
              toast={showToast}
            />
          )}
          {activeTab === "stages" && canManage && (
            activePipelineId ? (
              <StagesPanel
                stages={editablePipelineStages}
                activePipelineId={activePipelineId}
                leads={data.leads}
                reload={reload}
                toast={showToast}
              />
            ) : (
              <Panel title="Funnel stages">
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <div className="font-semibold text-slate-950">Select a pipeline first</div>
                  <p className="mt-1 text-sm text-slate-500">
                    Funnel stages are edited per pipeline. Choose a pipeline above to create, reorder, or edit
                    its stages.
                  </p>
                </div>
              </Panel>
            )
          )}
          {activeTab === "tags" && canManage && (
            <TagsPanel tags={data.tags} userId={currentUserId} canManage={canManage} reload={reload} toast={showToast} />
          )}
          {activeTab === "my-tags" && (
            <MyTagsPanel
              tags={data.tags}
              leads={visibleLeads}
              profiles={data.profiles}
              userId={currentUserId}
              reload={reload}
              toast={showToast}
              onOpenLead={openLead}
            />
          )}
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
          {activeTab === "pages" && canManage && (
            <PagesPanel
              pages={data.pages}
              teams={data.teams}
              userId={currentUserId}
              reload={reload}
              toast={showToast}
            />
          )}
          {activeTab === "customers" && (
            <CustomersPanel
              leads={data.leads}
              stages={data.stages}
              pipelines={data.pipelines}
              profiles={data.profiles}
              onOpenLead={openLead}
            />
          )}
          {activeTab === "reminders" && (
            <RemindersTab userId={currentUserId} onOpenLead={openLead} />
          )}
          {activeTab === "inbox" && (
            <ChatInbox
              pages={data.pages}
              profiles={data.profiles}
              pipelines={data.pipelines}
              stages={data.stages}
              tags={data.tags}
              userId={currentUserId}
              userRole={profile?.role ?? "staff"}
              toast={showToast}
              onLeadCreated={(leadId, pipelineId) => {
                void loadCrmData(supabase).then((fresh) => {
                  setData(fresh);
                  setActivePipelineId(pipelineId);
                  setActiveTab("leads");
                  setSelectedLeadId(leadId);
                });
              }}
            />
          )}
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
          userRole={profile?.role ?? "staff"}
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

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-slate-950 px-4 py-3 text-sm text-white shadow-xl">
          {toast}
        </div>
      ) : null}
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
