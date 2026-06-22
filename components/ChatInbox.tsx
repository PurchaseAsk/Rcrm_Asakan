"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Conversation, Message, Page, Pipeline, Profile, Stage } from "@/types/crm";
import html2canvas from "html2canvas";

const supabase = createBrowserSupabase();

export function ChatInbox({
  pages,
  profiles,
  pipelines,
  stages,
  userId,
  userRole,
  toast,
  onLeadCreated,
}: {
  pages: Page[];
  profiles: Profile[];
  pipelines: Pipeline[];
  stages: Stage[];
  userId: string;
  userRole: string;
  toast: (message: string) => void;
  onLeadCreated?: (leadId: string, pipelineId: string) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const selectedConvIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);

  type LeadDraft = { customer_name: string; phone: string; email: string; assigned_to: string; pipeline_id: string };
  const [leadModal, setLeadModal] = useState<{ conv: Conversation; msgs: Message[] } | null>(null);
  const [leadDraft, setLeadDraft] = useState<LeadDraft>({ customer_name: "", phone: "", email: "", assigned_to: "", pipeline_id: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    selectedConvIdRef.current = selectedConvId;
  }, [selectedConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    void refreshConversations();
    const channel = supabase
      .channel("chat-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async () => {
        await refreshConversations();
        const id = selectedConvIdRef.current;
        if (id) await refreshMessages(id);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshConversations() {
    let allowedPageIds: string[] | null = null;
    if (userRole !== "admin") {
      const [{ data: memberRows }, { data: pageTeamRows }, { data: allPageRows }] = await Promise.all([
        supabase.from("team_members").select("team_id").eq("user_id", userId),
        supabase.from("page_teams").select("page_id, team_id"),
        supabase.from("facebook_pages").select("id"),
      ]);
      const myTeamIds = new Set((memberRows ?? []).map((r: { team_id: string }) => r.team_id));
      const restrictedPages = new Set((pageTeamRows ?? []).map((r: { page_id: string }) => r.page_id));
      const myPages = new Set(
        (pageTeamRows ?? [])
          .filter((r: { team_id: string }) => myTeamIds.has(r.team_id))
          .map((r: { page_id: string }) => r.page_id),
      );
      const openPages = (allPageRows ?? [])
        .filter((p: { id: string }) => !restrictedPages.has(p.id))
        .map((p: { id: string }) => p.id);
      allowedPageIds = [...openPages, ...Array.from(myPages)];
    }

    let query = supabase
      .from("conversations")
      .select("*, facebook_pages(id, name, page_id), leads(id, customer_name)")
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (allowedPageIds !== null) {
      query =
        allowedPageIds.length > 0
          ? query.in("page_id", allowedPageIds)
          : query.eq("page_id", "00000000-0000-0000-0000-000000000000");
    }

    const { data } = await query;
    setConversations((data || []) as Conversation[]);
    setLoading(false);
  }

  async function refreshMessages(convId: string) {
    const { data } = await supabase
      .from("messages")
      .select("*, profiles(id, full_name, email)")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages((data || []) as Message[]);
  }

  async function openConversation(conv: Conversation) {
    setSelectedConvId(conv.id);
    setMessages([]);
    await refreshMessages(conv.id);

    if (!conv.sender_name) {
      try {
        const res = await fetch("/api/facebook/enrich-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conv_id: conv.id }),
        });
        if (res.ok) {
          const result = (await res.json()) as { name?: string | null };
          if (result.name) await refreshConversations();
        }
      } catch { /* non-critical */ }
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedConvId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/facebook/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: selectedConvId, text: replyText.trim(), sent_by: userId }),
      });
      const result = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast(result.error ?? "Send failed");
        return;
      }
      setReplyText("");
      await refreshMessages(selectedConvId);
      await refreshConversations();
    } finally {
      setBusy(false);
    }
  }

  async function sendImage(file: File) {
    if (!selectedConvId) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("conversation_id", selectedConvId);
      form.append("file", file);
      if (userId) form.append("sent_by", userId);
      const res = await fetch("/api/facebook/send-image", { method: "POST", body: form });
      const result = (await res.json()) as { error?: string };
      if (!res.ok) toast(result.error ?? "Send failed");
      else await refreshMessages(selectedConvId);
    } finally {
      setBusy(false);
    }
  }

  // stages for the currently selected pipeline in the draft
  const draftStages = useMemo(() => {
    if (!leadDraft.pipeline_id) return [];
    const scoped = stages.filter((s) => s.pipeline_id === leadDraft.pipeline_id && !s.is_unfollow);
    return scoped.length ? scoped : stages.filter((s) => !s.pipeline_id && !s.is_unfollow);
  }, [leadDraft.pipeline_id, stages]);

  function openCreateLead(conv: Conversation) {
    if (conv.lead_id) return;
    const defaultPipeline = pipelines[0]?.id ?? "";
    setLeadDraft({
      customer_name: conv.sender_name || "",
      phone: "",
      email: "",
      assigned_to: "",
      pipeline_id: defaultPipeline,
    });
    setLeadModal({ conv, msgs: messages });
  }

  async function submitCreateLead() {
    if (!leadModal) return;
    if (!leadDraft.customer_name.trim()) return toast("กรุณากรอกชื่อลูกค้า");
    if (!leadDraft.pipeline_id) return toast("กรุณาเลือก Pipeline");
    setSubmitting(true);
    try {
      const { conv } = leadModal;

      // Block duplicate phone — query DB using the same normalize_phone logic
      if (leadDraft.phone.trim()) {
        const { data: dups } = await supabase.rpc("find_lead_by_phone", {
          p_phone: leadDraft.phone.trim(),
        }) as { data: { id: string; customer_name: string }[] | null };
        if (dups?.[0]) {
          toast(`มีลีดอยู่แล้ว: ${dups[0].customer_name} (เบอร์ซ้ำ)`);
          return;
        }
      }

      const firstStageId = draftStages[0]?.id ?? null;
      const { data: lead, error } = await supabase
        .from("leads")
        .insert({
          customer_name: leadDraft.customer_name.trim(),
          phone: leadDraft.phone.trim() || null,
          email: leadDraft.email.trim() || null,
          assigned_to: leadDraft.assigned_to || null,
          pipeline_id: leadDraft.pipeline_id,
          stage_id: firstStageId,
          facebook_id: conv.sender_psid,
          page_id: conv.page_id,
          status: "active",
          source: "chat",
          last_activity_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) {
        toast(error.message);
        return;
      }

      // Capture chat area as PNG and upload to storage
      let snapshotContent = "💬 บทสนทนาจาก Facebook Messenger";
      if (messagesAreaRef.current) {
        try {
          const canvas = await html2canvas(messagesAreaRef.current, {
            useCORS: true,
            allowTaint: true,
            scale: 1.5,
            logging: false,
            backgroundColor: "#f8fafc",
          });
          const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
          if (blob) {
            const path = `snapshots/${conv.id}/${Date.now()}.png`;
            const { error: upErr } = await supabase.storage
              .from("chat-attachments")
              .upload(path, blob, { contentType: "image/png" });
            if (!upErr) {
              const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
              snapshotContent = JSON.stringify({ __img_snapshot: true, url: urlData.publicUrl });
            }
          }
        } catch { /* capture failed — fall back to plain text */ }
      }

      await Promise.all([
        supabase.from("conversations").update({ lead_id: lead.id }).eq("id", conv.id),
        supabase.from("lead_activities").insert({
          lead_id: lead.id,
          type: "created",
          content: "สร้างลีดจาก Facebook Messenger",
          created_by: userId,
        }),
        supabase.from("lead_activities").insert({
          lead_id: lead.id,
          type: "note",
          content: snapshotContent,
          created_by: userId,
        }),
      ]);

      toast("สร้างลีดสำเร็จ!");
      setLeadModal(null);
      await refreshConversations();
      onLeadCreated?.(lead.id, leadDraft.pipeline_id);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedConv = conversations.find((c) => c.id === selectedConvId) ?? null;

  // Use pages prop for tabs so admin/multi-team users always see all page tabs
  // regardless of whether conversations exist yet
  const accessiblePages = useMemo(() => {
    if (userRole === "admin") return pages.filter((p) => p.is_active);
    // For non-admin: show pages that appear in their loaded conversations
    const seen = new Map<string, string>();
    for (const c of conversations) {
      if (c.facebook_pages && !seen.has(c.page_id)) {
        seen.set(c.page_id, c.facebook_pages.name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name, is_active: true, page_id: "" }));
  }, [conversations, pages, userRole]);

  const [filterPageId, setFilterPageId] = useState<string | null>(null);

  const visibleConvs = filterPageId
    ? conversations.filter((c) => c.page_id === filterPageId)
    : conversations;

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid h-[calc(100dvh-160px)] min-h-[500px] md:grid-cols-[280px_1fr]">
          <div
            className={`flex min-h-0 flex-col overflow-hidden border-r border-slate-200 ${selectedConvId ? "hidden md:flex" : "flex"}`}
          >
            <div className="shrink-0 border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold text-slate-950">Inbox</h2>
              <p className="text-xs text-slate-500">{visibleConvs.length} conversations</p>
            </div>

            {accessiblePages.length > 1 && (
              <div className="shrink-0 flex gap-1 overflow-x-auto border-b border-slate-100 px-2 py-1.5 scrollbar-none">
                <button
                  onClick={() => setFilterPageId(null)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filterPageId === null ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ทั้งหมด
                  <span className={`ml-1 ${filterPageId === null ? "text-blue-200" : "text-slate-400"}`}>
                    {conversations.length}
                  </span>
                </button>
                {accessiblePages.map((p) => {
                  const count = conversations.filter((c) => c.page_id === p.id).length;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setFilterPageId(p.id)}
                      className={`shrink-0 max-w-[160px] truncate rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        filterPageId === p.id
                          ? "bg-brand-700 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {p.name}
                      <span className={`ml-1 ${filterPageId === p.id ? "text-blue-200" : "text-slate-400"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-sm text-slate-400">Loading…</div>
              ) : visibleConvs.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  <p className="font-medium">No conversations yet</p>
                  <p className="mt-1">
                    Messages from Facebook pages will appear here once the webhook is connected.
                  </p>
                </div>
              ) : (
                visibleConvs.map((conv) => (
                  <button
                    key={conv.id}
                    className={`w-full border-b border-slate-100 p-3 text-left hover:bg-slate-50 ${conv.id === selectedConvId ? "border-l-2 border-l-brand-700 bg-brand-50" : ""}`}
                    onClick={() => void openConversation(conv)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {conv.sender_name || conv.sender_psid}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {conv.facebook_pages?.name ?? "Unknown page"}
                        </div>
                        {conv.ad_name && (
                          <div className="mt-0.5 truncate rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            🎯 {conv.ad_name}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {conv.lead_id ? (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                            Lead
                          </span>
                        ) : null}
                        <div className="mt-1 text-[10px] text-slate-400">
                          {new Date(conv.last_message_at).toLocaleDateString("th-TH")}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedConv ? (
            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    className="text-sm text-slate-500 hover:text-slate-800 md:hidden"
                    onClick={() => setSelectedConvId(null)}
                  >
                    ← Back
                  </button>
                  <div>
                    <div className="font-semibold text-slate-950">
                      {selectedConv.sender_name || selectedConv.sender_psid}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{selectedConv.facebook_pages?.name}</span>
                      {selectedConv.ad_name && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                          🎯 {selectedConv.ad_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {selectedConv.lead_id ? (
                  <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">
                    Lead linked
                  </span>
                ) : (
                  <button
                    className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-900"
                    onClick={() => openCreateLead(selectedConv)}
                  >
                    + Create Lead
                  </button>
                )}
              </div>

              <div ref={messagesAreaRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((msg, idx) => {
                  const msgDate = new Date(msg.created_at).toDateString();
                  const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at).toDateString() : null;
                  const showDateSep = msgDate !== prevDate;
                  const dateLabel = new Date(msg.created_at).toLocaleDateString("th-TH", {
                    day: "numeric", month: "long", year: "numeric",
                  });
                  return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div className="my-2 flex items-center gap-3">
                        <div className="flex-1 border-t border-slate-200" />
                        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-0.5 text-[11px] text-slate-500">{dateLabel}</span>
                        <div className="flex-1 border-t border-slate-200" />
                      </div>
                    )}
                  <div
                    className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm ${
                        msg.direction === "outbound" ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-900"
                      }`}
                    >
                      {msg.attachment_type === "image" && msg.attachment_url ? (
                        <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={msg.attachment_url} alt="attachment" className="max-w-[240px] rounded-xl" />
                        </a>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                      <p
                        className={`mt-1 text-[10px] ${msg.direction === "outbound" ? "text-blue-200" : "text-slate-400"}`}
                      >
                        {msg.direction === "outbound" && msg.profiles && (
                          <span className="mr-1">{msg.profiles.full_name ?? msg.profiles.email}</span>
                        )}
                        {new Date(msg.created_at).toLocaleTimeString("th-TH", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  </div>
                  );
                })}
                {messages.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">No messages yet</div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              <div className="flex shrink-0 gap-2 border-t border-slate-200 p-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void sendImage(file);
                    e.target.value = "";
                  }}
                />
                <button
                  title="แนบรูป"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21zm8.25-7.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                    />
                  </svg>
                </button>
                <input
                  className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600 disabled:opacity-50"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendReply();
                    }
                  }}
                  placeholder="Type a message… (Enter to send)"
                  disabled={busy}
                />
                <button
                  className="rounded-lg bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busy || !replyText.trim()}
                  onClick={() => void sendReply()}
                >
                  {busy ? "…" : "Send"}
                </button>
              </div>
            </div>
          ) : (
            <div className="hidden items-center justify-center text-sm text-slate-400 md:flex">
              Select a conversation to start chatting
            </div>
          )}
        </div>
      </section>

      {/* Create Lead Modal */}
      {leadModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold text-slate-950">สร้างลีดจาก Inbox</h3>
              <p className="text-xs text-slate-500">
                {leadModal.conv.facebook_pages?.name} · {leadModal.conv.sender_psid}
              </p>
            </div>

            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">ชื่อลูกค้า *</label>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  value={leadDraft.customer_name}
                  onChange={(e) => setLeadDraft({ ...leadDraft, customer_name: e.target.value })}
                  placeholder="ชื่อ-นามสกุล"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">เบอร์โทร</label>
                  <input
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                    value={leadDraft.phone}
                    onChange={(e) => setLeadDraft({ ...leadDraft, phone: e.target.value })}
                    placeholder="0812345678"
                    type="tel"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                  <input
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                    value={leadDraft.email}
                    onChange={(e) => setLeadDraft({ ...leadDraft, email: e.target.value })}
                    placeholder="email@example.com"
                    type="email"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Pipeline *</label>
                <select
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  value={leadDraft.pipeline_id}
                  onChange={(e) => setLeadDraft({ ...leadDraft, pipeline_id: e.target.value })}
                >
                  <option value="">— เลือก Pipeline —</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {leadDraft.pipeline_id && draftStages[0] && (
                  <p className="mt-1 text-xs text-slate-400">Stage เริ่มต้น: {draftStages[0].name}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">มอบหมายให้</label>
                <select
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  value={leadDraft.assigned_to}
                  onChange={(e) => setLeadDraft({ ...leadDraft, assigned_to: e.target.value })}
                >
                  <option value="">— ไม่ระบุ —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Chat snapshot preview */}
              {leadModal.msgs.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    บันทึก snapshot {Math.min(leadModal.msgs.length, 5)} ข้อความสุดท้าย
                  </label>
                  <div className="max-h-36 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
                    {leadModal.msgs.slice(-5).map((m) => {
                      const time = new Date(m.created_at).toLocaleTimeString("th-TH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const sender =
                        m.direction === "inbound"
                          ? leadModal.conv.sender_name || "ลูกค้า"
                          : (m.profiles?.full_name ?? "ทีม");
                      const content = m.attachment_type === "image" ? "[รูปภาพ]" : (m.content ?? "");
                      return (
                        <div key={m.id} className="py-0.5">
                          <span className="text-slate-400">[{time}]</span>{" "}
                          <span className={m.direction === "outbound" ? "text-brand-700" : "text-slate-700"}>
                            {sender}:
                          </span>{" "}
                          {content}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                onClick={() => setLeadModal(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => void submitCreateLead()}
                disabled={submitting || !leadDraft.customer_name.trim()}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? "กำลังสร้าง…" : "สร้างลีด"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
