"use client";

// This page requires auth and a live Supabase connection — skip static prerendering.
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BellRing,
  BookUser,
  Boxes,
  Eye,
  EyeOff,
  Globe,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MessagesSquare,
  MessageSquareText,
  Settings,
  Split,
  Tags,
  UserCog,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Profile, StageRule } from "@/types/crm";
import type { AppData, LeadDetail, StageNoteRequest, TabId } from "@/types/app";
import { emptyData } from "@/types/app";
import {
  actorName,
  bootstrap,
  checkReminders,
  loadCrmData,
  loadLeadDetail,
  roleLabel,
  updateLeadStage,
} from "@/lib/helpers";

import { ChatInbox } from "@/components/ChatInbox";
import { CommentCenter } from "@/components/CommentCenter";
import { LineInbox } from "@/components/LineInbox";
import { CustomersPanel } from "@/components/CustomersPanel";
import { Dashboard } from "@/components/Dashboard";
import { FunnelBoard } from "@/components/FunnelBoard";
import { LeadDrawer } from "@/components/LeadDrawer";
import { LeadsPanel } from "@/components/LeadsPanel";
import { LoginScreen } from "@/components/LoginScreen";
import { LineOaPanel } from "@/components/LineOaPanel";
import { PagesPanel } from "@/components/PagesPanel";
import { PipelineBar } from "@/components/PipelineBar";
import { PipelineManagementModal } from "@/components/PipelineManagementModal";
import { PipelinePanel } from "@/components/PipelinePanel";
import { RemindersTab } from "@/components/RemindersTab";
import { UsersPanel } from "@/components/UsersPanel";
import { WebsiteSettingsTab } from "@/components/WebsiteSettingsTab";
import { RulesPanel } from "@/components/RulesPanel";
import { StageChangeNoteModal } from "@/components/StageChangeNoteModal";
import { StagesPanel } from "@/components/StagesPanel";
import { MyTagsPanel } from "@/components/MyTagsPanel";
import { TagsPanel } from "@/components/TagsPanel";
import { TeamsPanel } from "@/components/TeamsPanel";
import { VoucherModal } from "@/components/VoucherModal";
import { FullScreenState } from "@/components/ui/FullScreenState";
import { Panel } from "@/components/ui/Panel";

const mainTabs: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "funnel", label: "Lead", icon: Split },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "line", label: "Other Inbox", icon: MessagesSquare },
  { id: "reminders", label: "Reminders", icon: BellRing },
  { id: "my-tags", label: "แท็กของฉัน", icon: Tags },
  { id: "leads", label: "ลีดทั้งหมด", icon: UserRound },
];

const topbarTabs = mainTabs.filter((item) => !["dashboard", "my-tags", "leads"].includes(item.id));

const settingsTabs: { id: TabId; label: string; icon: LucideIcon; managerOnly?: boolean; adminOnly?: boolean }[] = [
  { id: "customers", label: "ทะเบียนลูกค้า", icon: BookUser },
  { id: "teams", label: "Teams", icon: Users, managerOnly: true },
  { id: "pipelines", label: "Pipelines", icon: Boxes, managerOnly: true },
  { id: "stages", label: "Stages", icon: Workflow, managerOnly: true },
  { id: "rules", label: "Rules", icon: Settings, managerOnly: true },
  { id: "tags", label: "Global Tags", icon: Tags, managerOnly: true },
  { id: "pages", label: "Pages", icon: Bell, managerOnly: true },
  { id: "line-oa", label: "LINE OA", icon: MessageSquareText, managerOnly: true },
  { id: "website", label: "Website Leads", icon: Globe, managerOnly: true },
  { id: "users", label: "จัดการ Users", icon: UserCog, adminOnly: true },
];

const supabase = createBrowserSupabase();

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<AppData>(emptyData);
  const [activeTab, setActiveTab] = useState<TabId>("reminders");
  const [otherInboxSubTab, setOtherInboxSubTab] = useState<"line" | "comment">("line");
  const [activePipelineId, setActivePipelineId] = useState("");
  const [leadFilter, setLeadFilter] = useState<"active" | "unfollowed">("active");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [funnelTagFilter, setFunnelTagFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootError, setBootError] = useState("");
  const [toast, setToast] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetail, setLeadDetail] = useState<LeadDetail>({ activities: [], reminders: [] });
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [managingPipelineId, setManagingPipelineId] = useState<string | null>(null);
  const [stageNoteRequest, setStageNoteRequest] = useState<StageNoteRequest | null>(null);
  const [voucherStage, setVoucherStage] = useState<import("@/types/crm").Stage | null>(null);
  const [pendingVoucherLead, setPendingVoucherLead] = useState<import("@/types/crm").Lead | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpenLeadId, setChatOpenLeadId] = useState<string | null>(null);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [lineUnreadCount, setLineUnreadCount] = useState(0);
  const [commentActiveCount, setCommentActiveCount] = useState(0);
  const [showChangePw, setShowChangePw] = useState(false);
  const [changePwDraft, setChangePwDraft] = useState({ current: "", pw: "", confirm: "" });
  const [visiblePwFields, setVisiblePwFields] = useState({ current: false, pw: false, confirm: false });
  const [changePwBusy, setChangePwBusy] = useState(false);

  // Ref so Realtime and reminder callbacks always read the latest leadId
  // without causing channel teardown on every lead open (H-2)
  const selectedLeadIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedLeadIdRef.current = selectedLeadId;
  }, [selectedLeadId]);

  // Ref to clear previous toast timer so rapid toasts don't stack (L-3)
  const toastTimerRef = useRef<number | null>(null);
  const defaultAssigneeAppliedForRef = useRef<string | null>(null);

  const currentUserId = session?.user.id || "";
  const canManage = profile?.role === "admin" || profile?.role === "team_lead";
  const selectedLead = data.leads.find((lead) => lead.id === selectedLeadId) || null;
  const managingPipeline = data.pipelines.find((pipeline) => pipeline.id === managingPipelineId) || null;

  useEffect(() => {
    if (!currentUserId || !profile) {
      defaultAssigneeAppliedForRef.current = null;
      return;
    }
    if (!canManage) return;
    if (defaultAssigneeAppliedForRef.current === currentUserId) return;
    defaultAssigneeAppliedForRef.current = currentUserId;
    setAssigneeFilter(currentUserId);
  }, [canManage, currentUserId, profile]);

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
      setBootstrapping(false);
      setBootError("");
      return;
    }

    let cancelled = false;
    const bootstrapTimeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("Loading CRM data took too long. Please retry.")), 12_000);
    });

    setBootstrapping(true);
    setBootError("");
    void Promise.race([
      bootstrap(session.user.id, session.user.email || "", setProfile, setData, showToast),
      bootstrapTimeout,
    ])
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load CRM data";
        setBootError(message);
        showToast(message);
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });
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
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]); // use .id (string) not object ref — prevents re-bootstrap on token refresh (e.g. wake from sleep)

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

  const visibleSettingsTabs = settingsTabs.filter(
    (tab) => (!tab.managerOnly || canManage) && (!tab.adminOnly || profile?.role === "admin"),
  );

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
      memberIds.add(currentUserId);
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

  function requestStageChangeNote(stageName: string, stageId: string) {
    const stageRule = (data.stageRules ?? []).find((r: StageRule) => r.stage_id === stageId) ?? null;
    return new Promise<string | null>((resolve) => {
      setStageNoteRequest({ stageName, stageRule, resolve });
    });
  }

  if (loading || bootstrapping) {
    return (
      <FullScreenState
        title={loading ? "Opening CRM" : "Loading CRM data"}
        description={loading ? "Checking session and Supabase connection" : "Loading profile, leads, and pipelines"}
      />
    );
  }

  if (bootError && session) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4 text-center">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mx-auto mb-4 h-10 w-10 rounded-lg bg-red-600" />
          <h1 className="font-semibold text-slate-950">CRM loading failed</h1>
          <p className="mt-2 text-sm text-slate-500">{bootError}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => void supabase.auth.signOut()}
              className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <main className="min-h-dvh bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-14 w-full items-center gap-1 px-3 xl:px-5">
          {/* Logo */}
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="mr-1 flex h-11 shrink-0 items-center gap-2 rounded-xl border border-transparent pr-3 transition hover:border-slate-200 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white shadow-sm">
              RP
            </span>
            <div className="hidden lg:block">
              <div className="text-sm font-semibold leading-tight text-slate-950">AsakanLeadFlow</div>
              <div className="text-[11px] text-slate-500">{roleLabel(profile?.role)}</div>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm lg:ml-1">
              <Menu size={15} />
            </span>
          </button>

          <div className="mr-1 h-7 w-px shrink-0 bg-slate-200" />

          {/* Main nav */}
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {topbarTabs.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`relative flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
                    active ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{item.label}</span>
                  {item.id === "inbox" && inboxUnreadCount > 0 && (
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-white/25 text-white" : "bg-blue-500 text-white"}`}>
                      {inboxUnreadCount}
                    </span>
                  )}
                  {item.id === "line" && (lineUnreadCount + commentActiveCount) > 0 && (
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-white/25 text-white" : "bg-rose-500 text-white"}`}>
                      {lineUnreadCount + commentActiveCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <Link
            href="/sales-hub"
            title="Sales Hub"
            className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 sm:px-3"
          >
            <Boxes size={16} />
            <span className="hidden xl:inline">Sales Hub</span>
          </Link>

        </div>
      </header>

      <div className={activeTab === "inbox" || activeTab === "line" ? "w-full" : "w-full px-3 py-4 sm:px-4 xl:px-6"}>
        <section className={`min-w-0 ${activeTab === "inbox" || activeTab === "line" ? "" : "space-y-4"}`}>
          {activeTab !== "inbox" && activeTab !== "line" && activeTab !== "reminders" && data.leads.length >= 8000 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              แสดง 8,000 ลีดล่าสุด — ลีดที่เก่ากว่าอาจไม่แสดงในหน้านี้
            </div>
          )}

          {activeTab !== "inbox" && activeTab !== "line" && activeTab !== "reminders" && (
            <PipelineBar
              pipelines={data.pipelines}
              activePipelineId={activePipelineId}
              onChange={setActivePipelineId}
              search={search}
              onSearchChange={setSearch}
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
              userRole={profile?.role}
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
              tags={data.tags}
              tagFilter={funnelTagFilter}
              setTagFilter={setFunnelTagFilter}
              recallRules={data.recallRules}
              onMoveLead={async (leadId, stage) => {
                if (stage.is_voucher_stage) {
                  const lead = data.leads.find((l) => l.id === leadId);
                  if (lead) {
                    setPendingVoucherLead(lead);
                    setVoucherStage(stage);
                  }
                  return;
                }
                const stageRule = (data.stageRules ?? []).find((r: StageRule) => r.stage_id === stage.id) ?? null;
                const noteRequester = stageRule
                  ? requestStageChangeNote
                  : (_name: string, _id: string) => Promise.resolve<string | null>("ย้าย stage");
                const moved = await updateLeadStage(
                  leadId,
                  stage,
                  currentUserId,
                  actorName(currentUserId, data.profiles),
                  noteRequester,
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
              onNavigate={(tab) => setActiveTab(tab as import("@/types/app").TabId)}
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
          {activeTab === "line-oa" && canManage && (
            <LineOaPanel
              accounts={data.lineOaAccounts}
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
            <RemindersTab userId={currentUserId} userRole={profile?.role ?? "staff"} onOpenLead={openLead} onNavigate={(tab) => setActiveTab(tab as import("@/types/app").TabId)} />
          )}
          {activeTab === "website" && canManage && (
            <WebsiteSettingsTab
              pipelines={data.pipelines}
              stages={data.stages}
              profiles={data.profiles}
              pages={data.pages}
            />
          )}
          {activeTab === "users" && profile?.role === "admin" && (
            <UsersPanel
              accessToken={session?.access_token ?? ""}
              currentUserId={currentUserId}
              onToast={showToast}
            />
          )}
          <div className={activeTab !== "inbox" ? "hidden" : ""}>
            <ChatInbox
              pages={data.pages}
              profiles={data.profiles}
              pipelines={data.pipelines}
              stages={data.stages}
              tags={data.tags}
              userId={currentUserId}
              userRole={profile?.role ?? "staff"}
              toast={showToast}
              openByLeadId={chatOpenLeadId}
              onLeadCreated={(leadId, pipelineId) => {
                void loadCrmData(supabase).then((fresh) => {
                  const createdLead = fresh.leads.find((lead) => lead.id === leadId);
                  setData(fresh);
                  setActivePipelineId(createdLead?.pipeline_id || pipelineId);
                  setActiveTab("leads");
                  setSelectedLeadId(leadId);
                });
              }}
              onUnreadCountChange={setInboxUnreadCount}
              onLeadOpen={(leadId) => {
                setActiveTab("leads");
                setSelectedLeadId(leadId);
              }}
            />
          </div>
          <div className={`flex h-full flex-col ${activeTab !== "line" ? "hidden" : ""}`}>
            <div className="flex shrink-0 gap-1 border-b border-slate-200 bg-white px-4 pt-2">
              <button
                onClick={() => setOtherInboxSubTab("line")}
                className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition ${otherInboxSubTab === "line" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-800"}`}
              >
                <MessageCircle size={15} />
                Line
              </button>
              <button
                onClick={() => setOtherInboxSubTab("comment")}
                className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition ${otherInboxSubTab === "comment" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-800"}`}
              >
                <MessageSquareText size={15} />
                Facebook Comment
              </button>
            </div>

            <div className={otherInboxSubTab !== "line" ? "hidden" : ""}>
              <LineInbox
                userId={currentUserId}
                pipelines={data.pipelines}
                stages={data.stages}
                profiles={data.profiles}
                toast={showToast}
                onLeadCreated={(leadId, pipelineId) => {
                  void loadCrmData(supabase).then((fresh) => {
                    const createdLead = fresh.leads.find((lead) => lead.id === leadId);
                    setData(fresh);
                    setActivePipelineId(createdLead?.pipeline_id || pipelineId);
                    setActiveTab("leads");
                    setSelectedLeadId(leadId);
                  });
                }}
                onLeadOpen={(leadId) => {
                  setActiveTab("leads");
                  setSelectedLeadId(leadId);
                }}
                onUnreadCountChange={setLineUnreadCount}
              />
            </div>

            <div className={otherInboxSubTab !== "comment" ? "hidden" : ""}>
              <CommentCenter pages={data.pages} userId={currentUserId} toast={showToast} onActiveCountChange={setCommentActiveCount} />
            </div>
          </div>
        </section>
      </div>

      {selectedLead ? (
        <LeadDrawer
          lead={selectedLead}
          detail={leadDetail}
          stages={pipelineStages}
          pipelines={data.pipelines}
          profiles={data.profiles}
          tags={data.tags}
          userId={currentUserId}
          userRole={profile?.role ?? "staff"}
          unfollowReasons={data.unfollowReasons.filter((r) => r.pipeline_id === selectedLead.pipeline_id)}
          requestStageChangeNote={requestStageChangeNote}
          onVoucherStage={(stage) => setVoucherStage(stage)}
          onClose={() => setSelectedLeadId(null)}
          reload={reloadSelectedLead}
          toast={showToast}
          onViewChat={() => {
            setChatOpenLeadId(selectedLead!.id);
            setActiveTab("inbox");
            setSelectedLeadId(null);
          }}
        />
      ) : null}

      {voucherStage && (pendingVoucherLead ?? selectedLead) && (() => {
        const voucherLead = pendingVoucherLead ?? selectedLead!;
        const closeVoucher = () => { setVoucherStage(null); setPendingVoucherLead(null); };
        return (
          <VoucherModal
            lead={voucherLead}
            stage={voucherStage}
            pipeline={data.pipelines.find((p) => p.id === voucherLead.pipeline_id) ?? null}
            salesProfile={data.profiles.find((p) => p.id === voucherLead.assigned_to) ?? null}
            userId={currentUserId}
            actorName={actorName(currentUserId, data.profiles)}
            onSuccess={() => {
              closeVoucher();
              void reload();
              showToast("ส่งขออนุมัติคูปองแล้ว");
            }}
            onClose={closeVoucher}
          />
        );
      })()}

      {managingPipeline ? (
        <PipelineManagementModal
          pipeline={managingPipeline}
          stages={data.stages.filter((stage) => stage.pipeline_id === managingPipeline.id)}
          recallRules={data.recallRules}
          teams={data.teams}
          profiles={data.profiles}
          leads={data.leads}
          userId={currentUserId}
          unfollowReasons={data.unfollowReasons}
          reload={reload}
          toast={showToast}
          onClose={() => setManagingPipelineId(null)}
        />
      ) : null}

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white shadow-sm">RP</div>
              <div>
                <div className="text-sm font-semibold text-slate-950">AsakanLeadFlow</div>
                <div className="text-[11px] text-slate-500">{roleLabel(profile?.role)}</div>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-2">
              {mainTabs.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                    className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      active ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <Icon size={16} />
                    {item.label}
                    {item.id === "inbox" && inboxUnreadCount > 0 && (
                      <span className={`ml-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-white/25 text-white" : "bg-blue-500 text-white"}`}>
                        {inboxUnreadCount}
                      </span>
                    )}
                    {item.id === "line" && (lineUnreadCount + commentActiveCount) > 0 && (
                      <span className={`ml-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-white/25 text-white" : "bg-rose-500 text-white"}`}>
                        {lineUnreadCount + commentActiveCount}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="mt-2 border-t border-slate-100 pt-2">
                {visibleSettingsTabs.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                        active ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                    >
                      <Icon size={16} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </nav>
            <div className="border-t border-slate-200 p-2">
              <button
                onClick={() => {
                  setShowChangePw(true);
                  setChangePwDraft({ current: "", pw: "", confirm: "" });
                  setVisiblePwFields({ current: false, pw: false, confirm: false });
                  setSidebarOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                <KeyRound size={16} />
                เปลี่ยนรหัสผ่าน
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                <LogOut size={16} />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </>
      )}

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-slate-950 px-4 py-3 text-sm text-white shadow-xl">
          {toast}
        </div>
      ) : null}
      {stageNoteRequest ? (
        <StageChangeNoteModal
          stageName={stageNoteRequest.stageName}
          stageRule={stageNoteRequest.stageRule}
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

      {/* Change password modal */}
      {showChangePw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold text-slate-950">เปลี่ยนรหัสผ่าน</h3>
              <button onClick={() => setShowChangePw(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">รหัสผ่านปัจจุบัน *</label>
                <div className="relative">
                  <input
                    type={visiblePwFields.current ? "text" : "password"}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-10 text-sm outline-none focus:border-brand-600"
                    value={changePwDraft.current}
                    onChange={(e) => setChangePwDraft({ ...changePwDraft, current: e.target.value })}
                    placeholder="รหัสผ่านที่ใช้อยู่ตอนนี้"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setVisiblePwFields((prev) => ({ ...prev, current: !prev.current }))}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700"
                    aria-label={visiblePwFields.current ? "Hide current password" : "Show current password"}
                  >
                    {visiblePwFields.current ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">รหัสผ่านใหม่ *</label>
                <div className="relative">
                  <input
                    type={visiblePwFields.pw ? "text" : "password"}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-10 text-sm outline-none focus:border-brand-600"
                    value={changePwDraft.pw}
                    onChange={(e) => setChangePwDraft({ ...changePwDraft, pw: e.target.value })}
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                  />
                  <button
                    type="button"
                    onClick={() => setVisiblePwFields((prev) => ({ ...prev, pw: !prev.pw }))}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700"
                    aria-label={visiblePwFields.pw ? "Hide new password" : "Show new password"}
                  >
                    {visiblePwFields.pw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">ยืนยันรหัสผ่านใหม่ *</label>
                <div className="relative">
                  <input
                    type={visiblePwFields.confirm ? "text" : "password"}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-10 text-sm outline-none focus:border-brand-600"
                    value={changePwDraft.confirm}
                    onChange={(e) => setChangePwDraft({ ...changePwDraft, confirm: e.target.value })}
                    placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                  />
                  <button
                    type="button"
                    onClick={() => setVisiblePwFields((prev) => ({ ...prev, confirm: !prev.confirm }))}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700"
                    aria-label={visiblePwFields.confirm ? "Hide confirm password" : "Show confirm password"}
                  >
                    {visiblePwFields.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {changePwDraft.confirm && changePwDraft.pw !== changePwDraft.confirm && (
                <p className="text-xs text-red-600">รหัสผ่านใหม่ไม่ตรงกัน</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                onClick={() => setShowChangePw(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                disabled={changePwBusy || !changePwDraft.current || changePwDraft.pw.length < 6 || changePwDraft.pw !== changePwDraft.confirm}
                onClick={async () => {
                  setChangePwBusy(true);
                  const email = session?.user.email ?? "";
                  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: changePwDraft.current });
                  if (verifyError) {
                    setChangePwBusy(false);
                    showToast("รหัสผ่านปัจจุบันไม่ถูกต้อง");
                    return;
                  }
                  const { error } = await supabase.auth.updateUser({ password: changePwDraft.pw });
                  setChangePwBusy(false);
                  if (error) { showToast(error.message); return; }
                  showToast("เปลี่ยนรหัสผ่านเรียบร้อย");
                  setShowChangePw(false);
                }}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {changePwBusy ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
