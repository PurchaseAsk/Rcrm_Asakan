"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Conversation, Message, Page, Pipeline, Profile, Stage, Tag } from "@/types/crm";
import html2canvas from "html2canvas";

const supabase = createBrowserSupabase();
const CONVERSATION_PAGE_SIZE = 30;

// Singleton AudioContext — unlocked on first user gesture, reused for all pings
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === "closed") _audioCtx = new AudioContext();
  return _audioCtx;
}
// Call on any user interaction so the context is pre-unlocked before a Realtime event fires
function touchAudio() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* ignore */ }
}

async function playPing() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") await ctx.resume();

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.18, ctx.currentTime);
    master.connect(ctx.destination);

    // C4 + E4 — warm major-third ding
    ([
      { delay: 0,    freq: 261.63, type: "triangle" as OscillatorType, peak: 0.85 },
      { delay: 0.18, freq: 329.63, type: "sine"     as OscillatorType, peak: 0.55 },
    ] as const).forEach(({ delay, freq, type, peak }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(master);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(peak, ctx.currentTime + delay + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.5);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.52);
    });
  } catch { /* ignore */ }
}

const AVATAR_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#14b8a6","#f59e0b"];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function isUnread(conv: Conversation): boolean {
  if (conv.last_message_direction === "outbound") return false;
  if (!conv.last_read_at) return true;
  return new Date(conv.last_message_at) > new Date(conv.last_read_at);
}

export function ChatInbox({
  pages,
  profiles,
  pipelines,
  stages,
  tags,
  userId,
  userRole,
  toast,
  onLeadCreated,
  onLeadOpen,
  onUnreadCountChange,
  openByLeadId,
}: {
  pages: Page[];
  profiles: Profile[];
  pipelines: Pipeline[];
  stages: Stage[];
  tags: Tag[];
  userId: string;
  userRole: string;
  toast: (message: string) => void;
  onLeadCreated?: (leadId: string, pipelineId: string) => void;
  onLeadOpen?: (leadId: string) => void;
  onUnreadCountChange?: (count: number) => void;
  openByLeadId?: string | null;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedConvObj, setSelectedConvObj] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [busy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMoreConvs, setLoadingMoreConvs] = useState(false);
  const [conversationTotal, setConversationTotal] = useState<number | null>(null);
  const selectedConvIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const enrichingConvIdsRef = useRef<Set<string>>(new Set());

  type LeadDraft = { customer_name: string; phone: string; email: string; assigned_to: string; pipeline_id: string };
  type QuickReply = { id: string; title: string; content: string };
  const [leadModal, setLeadModal] = useState<{ conv: Conversation; msgs: Message[] } | null>(null);
  const [leadDraft, setLeadDraft] = useState<LeadDraft>({ customer_name: "", phone: "", email: "", assigned_to: "", pipeline_id: "" });
  const [submitting, setSubmitting] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showAppImages, setShowAppImages] = useState(false);
  const [appImagesProject, setAppImagesProject] = useState<"wela" | "elysium">("wela");
  const [appImages, setAppImages] = useState<{ name: string; url: string }[]>([]);
  const [appFolders, setAppFolders] = useState<string[]>([]);
  const [appImagesFolder, setAppImagesFolder] = useState<string | null>(null);
  const [selectedImgUrls, setSelectedImgUrls] = useState<string[]>([]);
  const [loadingAppImages, setLoadingAppImages] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [qrDraft, setQrDraft] = useState<{ title: string; content: string } | null>(null);
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [, setMinuteTick] = useState(0);

  type ConvNote = { id: string; content: string; created_by: string | null; created_at: string };
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notes, setNotes] = useState<ConvNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  function messagePreview(msg: Message | null) {
    if (!msg) return "";
    if (msg.attachment_type === "image") return "[รูปภาพ]";
    return (msg.content ?? "").replace(/\s+/g, " ").trim();
  }

  useEffect(() => {
    selectedConvIdRef.current = selectedConvId;
    if (selectedConvId) {
      sessionStorage.setItem("chat_selected_conv_id", selectedConvId);
    } else {
      sessionStorage.removeItem("chat_selected_conv_id");
    }
  }, [selectedConvId]);

  // Restore selected conversation after page reload (e.g. wake from sleep)
  useEffect(() => {
    if (loading || conversations.length === 0 || selectedConvId) return;
    const savedId = sessionStorage.getItem("chat_selected_conv_id");
    if (!savedId) return;
    const conv = conversations.find((c) => c.id === savedId);
    if (conv) {
      void openConversation(conv);
    } else {
      // Conversation not in first page — fetch directly
      void supabase
        .from("conversations")
        .select("*, facebook_pages(id, name, page_id), leads(id, customer_name), conversation_tags(tag_id, tags(id, name, color))")
        .eq("id", savedId)
        .single()
        .then(({ data }) => {
          if (data) void openConversation(data as Conversation);
          else sessionStorage.removeItem("chat_selected_conv_id");
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, conversations]);

  useEffect(() => {
    if (!openByLeadId) return;
    async function findAndOpen() {
      const { data } = await supabase
        .from("conversations")
        .select("*, facebook_pages(id, name, page_id), leads(id, customer_name), conversation_tags(tag_id, tags(id, name, color))")
        .eq("lead_id", openByLeadId!)
        .limit(1)
        .single();
      if (data) void openConversation(data as Conversation);
    }
    void findAndOpen();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openByLeadId]);

  useEffect(() => {
    void supabase
      .from("quick_replies")
      .select("id, title, content")
      .eq("user_id", userId)
      .order("created_at")
      .then(({ data }) => setQuickReplies((data ?? []) as QuickReply[]));
  }, [userId]);

  useEffect(() => {
    const t = window.setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Unlock AudioContext on first user gesture so Realtime pings can play without autoplay block
  useEffect(() => {
    document.addEventListener("click", touchAudio, { once: true });
    document.addEventListener("keydown", touchAudio, { once: true });
    return () => {
      document.removeEventListener("click", touchAudio);
      document.removeEventListener("keydown", touchAudio);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  useEffect(() => {
    void refreshConversations();
    const channel = supabase
      .channel("chat-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const newMsg = payload.new as { conversation_id: string; direction: string };
        const convId = newMsg.conversation_id;
        const id = selectedConvIdRef.current;
        if (newMsg.direction === "inbound") {
          playPing();
        }
        if (id && convId === id) {
          await refreshMessages(id);
          const now = new Date().toISOString();
          void supabase.from("conversations").update({ last_read_at: now }).eq("id", id);
          setConversations((prev) => prev.map((c) => c.id === id ? { ...c, last_read_at: now } : c));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations" }, async () => {
        await refreshConversations();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, (payload) => {
        const updated = payload.new as {
          id: string;
          customer_read_at: string | null;
          last_message_text: string | null;
          last_message_direction: "inbound" | "outbound" | null;
          last_message_at: string;
          last_read_at: string | null;
          is_pinned: boolean;
        };
        setConversations((prev) => {
          const next = prev.map((c) =>
            c.id === updated.id
              ? {
                  ...c,
                  customer_read_at: updated.customer_read_at,
                  last_message_text: updated.last_message_text,
                  last_message_direction: updated.last_message_direction,
                  last_message_at: updated.last_message_at,
                  last_read_at: updated.last_read_at,
                  is_pinned: updated.is_pinned,
                }
              : c,
          );
          return next.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
          });
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getAllowedPageIds() {
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
    return allowedPageIds;
  }

  async function fetchConversationPage(page: number, append = false, pageIdFilter?: string | null) {
    const allowedPageIds = await getAllowedPageIds();
    const from = page * CONVERSATION_PAGE_SIZE;
    const to = from + CONVERSATION_PAGE_SIZE - 1;
    let query = supabase
      .from("conversations")
      .select("*, facebook_pages(id, name, page_id), leads(id, customer_name), conversation_tags(tag_id, tags(id, name, color))", { count: "exact" })
      .order("is_pinned", { ascending: false })
      .order("last_message_at", { ascending: false })
      .range(from, to);

    if (pageIdFilter) {
      query = query.eq("page_id", pageIdFilter);
    } else if (allowedPageIds !== null) {
      query =
        allowedPageIds.length > 0
          ? query.in("page_id", allowedPageIds)
          : query.eq("page_id", "00000000-0000-0000-0000-000000000000");
    }

    const { data, count } = await query;
    const rows = (data || []) as Conversation[];
    if (count !== null) setConversationTotal(count);
    setConversations((prev) => {
      if (!append) return rows;
      const seen = new Set(prev.map((conv) => conv.id));
      return [...prev, ...rows.filter((conv) => !seen.has(conv.id))];
    });
  }

  async function refreshConversations() {
    await fetchConversationPage(0);
    setLoading(false);
  }

  async function changePageFilter(newPageId: string | null) {
    setFilterPageId(newPageId);
    setConversations([]);
    setConversationTotal(null);
    setLoading(true);
    await fetchConversationPage(0, false, newPageId);
    setLoading(false);
  }

  async function loadMoreConversations() {
    if (loadingMoreConvs) return;
    if (conversationTotal !== null && conversations.length >= conversationTotal) return;
    setLoadingMoreConvs(true);
    try {
      const nextPage = Math.floor(conversations.length / CONVERSATION_PAGE_SIZE);
      await fetchConversationPage(nextPage, true, filterPageId);
    } finally {
      setLoadingMoreConvs(false);
    }
  }

  function handleConversationScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
      void loadMoreConversations();
    }
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

  async function markRead(convId: string) {
    const now = new Date().toISOString();
    await supabase.from("conversations").update({ last_read_at: now }).eq("id", convId);
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, last_read_at: now } : c));
  }

  async function togglePin(convId: string, currentlyPinned: boolean) {
    const next = !currentlyPinned;
    await supabase.from("conversations").update({ is_pinned: next }).eq("id", convId);
    setConversations((prev) => {
      const updated = prev.map((c) => c.id === convId ? { ...c, is_pinned: next } : c);
      return updated.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });
    });
  }

  async function markUnread(convId: string) {
    await supabase.from("conversations").update({ last_read_at: null }).eq("id", convId);
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, last_read_at: null } : c));
  }

  async function markHandled(convId: string) {
    await supabase.from("conversations").update({ last_message_direction: "outbound" }).eq("id", convId);
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, last_message_direction: "outbound" } : c),
    );
  }

  async function addConvTag(convId: string, tagId: string) {
    const { error } = await supabase.from("conversation_tags").insert({ conversation_id: convId, tag_id: tagId });
    if (error) return;
    const tag = tags.find((t) => t.id === tagId);
    if (!tag) return;
    setConversations((prev) => prev.map((c) =>
      c.id === convId
        ? { ...c, conversation_tags: [...(c.conversation_tags ?? []), { tag_id: tagId, tags: { id: tag.id, name: tag.name, color: tag.color } }] }
        : c
    ));
  }

  async function removeConvTag(convId: string, tagId: string) {
    await supabase.from("conversation_tags").delete().eq("conversation_id", convId).eq("tag_id", tagId);
    setConversations((prev) => prev.map((c) =>
      c.id === convId
        ? { ...c, conversation_tags: (c.conversation_tags ?? []).filter((ct) => ct.tag_id !== tagId) }
        : c
    ));
  }

  async function openConversation(conv: Conversation) {
    setSelectedConvId(conv.id);
    setSelectedConvObj(conv);
    setShowTagPicker(false);
    setReplyTarget(null);
    setMessages([]);
    setNotes([]);
    setShowNotesModal(false);
    await refreshMessages(conv.id);
    void loadNotes(conv.id);
    void markRead(conv.id);

    if (!conv.sender_name || !conv.picture_url) {
      try {
        const res = await fetch("/api/facebook/enrich-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conv_id: conv.id }),
        });
        if (res.ok) {
          const result = (await res.json()) as { name?: string | null; picture_url?: string | null };
          if (result.name || result.picture_url) await refreshConversations();
        }
      } catch { /* non-critical */ }
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedConvId) return;
    const text = replyText.trim();
    const convId = selectedConvId;
    const quotedMessage = replyTarget;
    const tempId = `opt-${Date.now()}`;
    const now = new Date().toISOString();

    const optimistic: Message = {
      id: tempId,
      conversation_id: convId,
      direction: "outbound",
      content: text,
      created_at: now,
      attachment_type: null,
      attachment_url: null,
      fb_message_id: null,
      sent_by: userId,
      profiles: null,
      reply_to_message_id: quotedMessage?.id ?? null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setReplyText("");
    setReplyTarget(null);
    setConversations((prev) => prev.map((c) =>
      c.id === convId
        ? { ...c, customer_read_at: null, last_message_text: text, last_message_direction: "outbound", last_message_at: now }
        : c,
    ));

    try {
      const res = await fetch("/api/facebook/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: convId,
          text,
          sent_by: userId,
          reply_to_message_id: quotedMessage?.id ?? null,
          reply_to_text: messagePreview(quotedMessage),
        }),
      });
      const result = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setReplyText(text);
        setReplyTarget(quotedMessage);
        toast(result.error ?? "ส่งไม่สำเร็จ");
        return;
      }
      await refreshMessages(convId);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setReplyText(text);
      setReplyTarget(quotedMessage);
      toast("ส่งไม่สำเร็จ");
    }
  }

  async function sendImage(file: File) {
    if (!selectedConvId) return;
    if (file.size > 4.5 * 1024 * 1024) { toast("ไฟล์ใหญ่เกิน 4.5 MB — กรุณาบีบอัดรูปก่อนส่ง"); return; }
    const convId = selectedConvId;
    const tempId = `opt-${Date.now()}`;
    const now = new Date().toISOString();
    const blobUrl = URL.createObjectURL(file);

    const optimistic: Message = {
      id: tempId,
      conversation_id: convId,
      direction: "outbound",
      content: null,
      created_at: now,
      attachment_type: "image",
      attachment_url: blobUrl,
      fb_message_id: null,
      sent_by: userId,
      profiles: null,
      reply_to_message_id: null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setConversations((prev) => prev.map((c) =>
      c.id === convId ? { ...c, customer_read_at: null, last_message_text: "[รูปภาพ]", last_message_direction: "outbound", last_message_at: now } : c,
    ));

    try {
      const form = new FormData();
      form.append("conversation_id", convId);
      form.append("file", file);
      if (userId) form.append("sent_by", userId);
      const res = await fetch("/api/facebook/send-image", { method: "POST", body: form });
      const result = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        toast(result.error ?? "ส่งไม่สำเร็จ");
      } else {
        await refreshMessages(convId);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast("ส่งไม่สำเร็จ");
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function sendImageByUrl(imageUrl: string) {
    if (!selectedConvId) return;
    const convId = selectedConvId;
    const tempId = `opt-${Date.now()}`;
    const now = new Date().toISOString();

    const optimistic: Message = {
      id: tempId,
      conversation_id: convId,
      direction: "outbound",
      content: null,
      created_at: now,
      attachment_type: "image",
      attachment_url: imageUrl,
      fb_message_id: null,
      sent_by: userId,
      profiles: null,
      reply_to_message_id: null,
    };

    setShowAppImages(false);
    setMessages((prev) => [...prev, optimistic]);
    setConversations((prev) => prev.map((c) =>
      c.id === convId ? { ...c, customer_read_at: null, last_message_text: "[รูปภาพ]", last_message_direction: "outbound", last_message_at: now } : c,
    ));

    try {
      const res = await fetch("/api/facebook/send-image-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: convId, image_url: imageUrl, sent_by: userId }),
      });
      const result = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        toast(result.error ?? "ส่งไม่สำเร็จ");
      } else {
        await refreshMessages(convId);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast("ส่งไม่สำเร็จ");
    }
  }

  async function loadAppImages(project: "wela" | "elysium", folder?: string | null) {
    setLoadingAppImages(true);
    setAppImages([]);
    setAppFolders([]);
    setSelectedImgUrls([]);
    try {
      const params = new URLSearchParams({ project });
      if (folder) params.set("folder", folder);
      const res = await fetch(`/api/project-images?${params.toString()}`);
      if (!res.ok) return;
      const json = (await res.json()) as { folders: string[]; images: { name: string; url: string }[] };
      setAppFolders(json.folders ?? []);
      setAppImages(json.images ?? []);
    } finally {
      setLoadingAppImages(false);
    }
  }

  async function sendSelectedImages() {
    const urls = [...selectedImgUrls];
    setSelectedImgUrls([]);
    setShowAppImages(false);
    setAppImagesFolder(null);
    await Promise.all(urls.map((url) => sendImageByUrl(url)));
  }

  function toggleImgSelection(url: string) {
    setSelectedImgUrls((prev) => {
      if (prev.includes(url)) return prev.filter((u) => u !== url);
      if (prev.length >= 10) return prev;
      return [...prev, url];
    });
  }

  async function addQuickReply() {
    if (!qrDraft?.title.trim() || !qrDraft?.content.trim()) return;
    const { data } = await supabase.from("quick_replies").insert({
      user_id: userId,
      title: qrDraft.title.trim(),
      content: qrDraft.content.trim(),
    }).select("id, title, content").single();
    if (data) setQuickReplies((prev) => [...prev, data as QuickReply]);
    setQrDraft(null);
  }

  async function deleteQuickReply(id: string) {
    await supabase.from("quick_replies").delete().eq("id", id);
    setQuickReplies((prev) => prev.filter((r) => r.id !== id));
  }

  async function loadNotes(convId: string) {
    setNotesLoading(true);
    const { data } = await supabase
      .from("conversation_notes")
      .select("id, content, created_by, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setNotes((data ?? []) as ConvNote[]);
    setNotesLoading(false);
  }

  async function saveNote() {
    if (!selectedConvId || !noteDraft.trim()) return;
    setNoteSaving(true);
    await supabase.from("conversation_notes").insert({
      conversation_id: selectedConvId,
      content: noteDraft.trim(),
      created_by: userId,
    });
    setNoteDraft("");
    await loadNotes(selectedConvId);
    setNoteSaving(false);
  }

  async function deleteNote(noteId: string) {
    if (!selectedConvId) return;
    await supabase.from("conversation_notes").delete().eq("id", noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
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
    if (!leadDraft.phone.trim()) return toast("กรุณากรอกเบอร์โทร");
    if (!leadDraft.pipeline_id) return toast("กรุณาเลือก Pipeline");
    setSubmitting(true);
    try {
      const { conv } = leadModal;

      // Block duplicate phone — query DB using the same normalize_phone logic
      if (leadDraft.phone.trim()) {
        const { data: dups } = await supabase.rpc("find_lead_by_phone", {
          p_phone: leadDraft.phone.trim(),
          p_pipeline_id: leadDraft.pipeline_id || null,
        }) as { data: { id: string; customer_name: string }[] | null };
        if (dups?.[0]) {
          toast(`มีลีดอยู่แล้วใน pipeline นี้: ${dups[0].customer_name} (เบอร์ซ้ำ)`);
          return;
        }
      }

      const firstStageId = draftStages[0]?.id ?? null;
      const now = new Date().toISOString();
      const { data: lead, error } = await supabase
        .from("leads")
        .insert({
          customer_name: leadDraft.customer_name.trim(),
          phone: leadDraft.phone.trim() || null,
          email: leadDraft.email.trim() || null,
          assigned_to: leadDraft.assigned_to || null,
          pipeline_id: leadDraft.pipeline_id,
          stage_id: firstStageId,
          stage_entered_at: firstStageId ? now : null,
          facebook_id: conv.sender_psid,
          page_id: conv.page_id,
          status: "active",
          source: "chat",
          last_activity_at: now,
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
      if (!leadDraft.assigned_to) {
        await supabase.rpc("distribute_lead", { p_lead_id: lead.id });
      }
      void fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "lead",
          name: leadDraft.customer_name.trim(),
          phone: leadDraft.phone.trim() || undefined,
          page_name: conv.facebook_pages?.name,
          pipeline_name: pipelines.find((p) => p.id === leadDraft.pipeline_id)?.name,
        }),
      });

      setLeadModal(null);
      await refreshConversations();
      onLeadCreated?.(lead.id, leadDraft.pipeline_id);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedConv = conversations.find((c) => c.id === selectedConvId) ?? selectedConvObj;

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
  const [filterTagIds, setFilterTagIds] = useState<Set<string>>(new Set());

  const usedConvTags = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string }>();
    for (const c of conversations) {
      for (const ct of c.conversation_tags ?? []) {
        if (ct.tags && !seen.has(ct.tag_id)) seen.set(ct.tag_id, ct.tags);
      }
    }
    return [...seen.values()];
  }, [conversations]);

  const pageFilteredConvs = filterPageId
    ? conversations.filter((c) => c.page_id === filterPageId)
    : conversations;
  const tagFilteredConvs = filterTagIds.size > 0
    ? pageFilteredConvs.filter((c) => {
        const convTagIds = new Set((c.conversation_tags ?? []).map((ct) => ct.tag_id));
        return [...filterTagIds].every((id) => convTagIds.has(id));
      })
    : pageFilteredConvs;
  const oneHourAgo = Date.now() - 3_600_000;
  const overdueConvs = conversations.filter(
    (c) => c.last_message_direction === "inbound" && new Date(c.last_message_at).getTime() < oneHourAgo,
  );
  const overdueIds = new Set(overdueConvs.map((c) => c.id));
  const baseVisibleConvs = filterUnread ? tagFilteredConvs.filter(isUnread) : tagFilteredConvs;
  const visibleConvs = filterOverdue ? conversations.filter((c) => overdueIds.has(c.id)) : baseVisibleConvs;
  const hasMoreConversations = conversationTotal === null || conversations.length < conversationTotal;
  const hasActiveConversationFilters = Boolean(filterPageId || filterUnread || filterTagIds.size > 0 || filterOverdue);
  const conversationCountLabel = hasActiveConversationFilters
    ? `${visibleConvs.length} shown (${conversations.length}${conversationTotal !== null ? ` of ${conversationTotal}` : ""} loaded)`
    : `${conversations.length}${conversationTotal !== null && hasMoreConversations ? ` of ${conversationTotal}` : ""} conversations`;

  useEffect(() => {
    const targets = visibleConvs
      .filter((conv) => (!conv.sender_name || !conv.picture_url) && !enrichingConvIdsRef.current.has(conv.id))
      .slice(0, 6);
    if (!targets.length) return;

    let cancelled = false;
    targets.forEach((conv) => enrichingConvIdsRef.current.add(conv.id));
    void Promise.all(
      targets.map(async (conv) => {
        try {
          const res = await fetch("/api/facebook/enrich-name", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conv_id: conv.id }),
          });
          if (!res.ok) {
            enrichingConvIdsRef.current.delete(conv.id);
            return false;
          }
          const result = (await res.json()) as { name?: string | null; picture_url?: string | null };
          if (!result.name && !result.picture_url) enrichingConvIdsRef.current.delete(conv.id);
          return Boolean(result.name || result.picture_url);
        } catch {
          enrichingConvIdsRef.current.delete(conv.id);
          return false;
        }
      }),
    ).then((updated) => {
      if (!cancelled && updated.some(Boolean)) void refreshConversations();
    });

    return () => { cancelled = true; };
  }, [visibleConvs]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTagFilter(tagId: string) {
    setFilterTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId); else next.add(tagId);
      return next;
    });
  }
  const unreadCount = conversations.filter(isUnread).length;

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  return (
    <>
      <section className="overflow-hidden border-t border-slate-200 bg-white">
        <div className="grid h-[calc(100dvh-56px)] min-h-[500px] md:grid-cols-[380px_1fr]">
          <div
            className={`flex min-h-0 flex-col overflow-hidden border-r border-slate-200 ${selectedConvId ? "hidden md:flex" : "flex"}`}
          >
            <div className="shrink-0 border-b border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="font-semibold text-slate-950">Inbox</h2>
                  {unreadCount > 0 && (
                    <span className="inline-flex items-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {accessiblePages.length > 1 && (
                  <select
                    className="h-7 max-w-[140px] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-brand-600 focus:outline-none"
                    value={filterPageId ?? ""}
                    onChange={(e) => void changePageFilter(e.target.value || null)}
                  >
                    <option value="">ทุกเพจ</option>
                    {accessiblePages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <p className="text-xs text-slate-500">{conversationCountLabel}</p>
            </div>

            <div className="shrink-0 border-b border-slate-100 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
              {usedConvTags.length > 0 && (
                <>
                  {filterTagIds.size > 0 && (
                    <button
                      onClick={() => setFilterTagIds(new Set())}
                      className="h-6 rounded-full border border-slate-200 px-2 text-[10px] text-slate-500 hover:bg-slate-100"
                    >
                      ล้าง
                    </button>
                  )}
                  {usedConvTags.map((t) => {
                    const active = filterTagIds.has(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTagFilter(t.id)}
                        className="h-6 rounded-full px-2.5 text-[10px] font-medium transition-opacity"
                        style={{
                          backgroundColor: active ? t.color : `${t.color}22`,
                          color: active ? "#fff" : t.color,
                          outline: active ? `2px solid ${t.color}` : "none",
                          outlineOffset: "1px",
                        }}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </>
              )}
              <button
                onClick={() => setFilterUnread((v) => !v)}
                className={`shrink-0 h-6 rounded-full border px-2.5 text-[10px] font-medium transition-colors ${
                  filterUnread
                    ? "border-blue-400 bg-blue-500 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                ยังไม่อ่าน{!filterUnread && unreadCount > 0 ? ` (${unreadCount})` : ""}
              </button>
              </div>
            </div>

            {overdueConvs.length > 0 && (
              <button
                onClick={() => setFilterOverdue((v) => !v)}
                className={`flex w-full shrink-0 items-center gap-2 border-b px-3 py-2 text-xs font-medium transition-colors ${
                  filterOverdue
                    ? "border-rose-600 bg-rose-500 text-white"
                    : "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100"
                }`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-1 ring-white">
                  {overdueConvs.length > 9 ? "9+" : overdueConvs.length}
                </span>
                <span className="flex-1 text-left">
                  {overdueConvs.length} แชทรอตอบเกิน 1 ชม.
                </span>
                {filterOverdue && <span className="opacity-70">✕</span>}
              </button>
            )}

            <div className="flex-1 overflow-y-auto" onScroll={handleConversationScroll}>
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
                <>
                {visibleConvs.map((conv) => (
                  <button
                    key={conv.id}
                    className={`w-full border-b border-slate-100 p-3 text-left hover:bg-slate-50 ${
                      conv.id === selectedConvId
                        ? "border-l-2 border-l-brand-700 bg-brand-50"
                        : isUnread(conv)
                          ? "bg-blue-50/40"
                          : ""
                    }`}
                    onClick={() => void openConversation(conv)}
                  >
                    <div className="flex items-start gap-2.5">
                      {conv.picture_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={conv.picture_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: avatarColor(conv.sender_name || conv.sender_psid) }}
                        >
                          {(conv.sender_name || conv.sender_psid).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-sm ${isUnread(conv) ? "font-semibold text-slate-950" : "font-medium text-slate-900"}`}>
                          {conv.sender_name || conv.sender_psid}
                        </div>
                        <div className="flex items-center gap-1 truncate">
                          <span className="truncate text-xs text-slate-400">{conv.facebook_pages?.name ?? "Unknown page"}</span>
                        </div>
                        {conv.last_message_text && (
                          <div className={`mt-0.5 truncate text-xs ${isUnread(conv) ? "font-medium text-slate-700" : "text-slate-400"}`}>
                            {conv.last_message_text}
                          </div>
                        )}
                        {(conv.conversation_tags ?? []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-0.5">
                            {(conv.conversation_tags ?? []).map(({ tag_id, tags: tag }) =>
                              tag ? (
                                <span key={tag_id} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: tag.color }}>
                                  {tag.name}
                                </span>
                              ) : null
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          {conv.is_pinned && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M16 12V4h1a1 1 0 000-2H7a1 1 0 000 2h1v8l-2 2v2h5v5l1 1 1-1v-5h5v-2l-2-2z"/>
                            </svg>
                          )}
                          <div className={`text-[10px] leading-tight text-right ${isUnread(conv) ? "font-medium text-blue-600" : "text-slate-400"}`}>
                            <div>{new Date(conv.last_message_at).toLocaleDateString("th-TH")}</div>
                            <div>{new Date(conv.last_message_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {conv.lead_id && (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">Lead</span>
                          )}
                          {conv.customer_read_at && conv.last_message_direction === "outbound" ? (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">อ่านแล้ว ✓</span>
                          ) : conv.last_message_direction === "outbound" ? (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">ตอบแล้ว ✓</span>
                          ) : isUnread(conv) ? (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">●</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
                {hasMoreConversations && (
                  <div className="border-b border-slate-100 p-3 text-center text-xs text-slate-400">
                    {loadingMoreConvs ? "Loading more..." : "Scroll for older conversations"}
                  </div>
                )}
                </>
              )}
            </div>
          </div>

          {selectedConv ? (
            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-slate-200">
                {/* Main header row */}
                <div className="flex items-center gap-1.5 px-3 py-2 md:gap-2 md:px-4 md:py-3">
                  {/* Back — chevron icon on mobile */}
                  <button
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:hidden"
                    onClick={() => { setSelectedConvId(null); setSelectedConvObj(null); }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {/* Name + page */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-950">
                      {selectedConv.sender_name || selectedConv.sender_psid}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="truncate">{selectedConv.facebook_pages?.name}</span>
                      {/* Ad name inline on desktop only */}
                      {selectedConv.ad_name && (
                        <span className="hidden truncate rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 md:inline-flex">
                          🎯 {selectedConv.ad_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {/* จบแชท — icon-only on mobile, text on desktop */}
                    {selectedConv.last_message_direction === "inbound" && (
                      <button
                        title="Mark as handled — ไม่นับเป็น overdue"
                        onClick={() => void markHandled(selectedConv.id)}
                        className="flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 text-slate-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <span className="text-sm leading-none">✓</span>
                        <span className="hidden text-xs md:inline">จบแชท</span>
                      </button>
                    )}
                    <button
                      title="Mark as unread"
                      onClick={() => void markUnread(selectedConv.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button
                      title="บันทึกภายใน"
                      onClick={() => { setShowNotesModal(true); void loadNotes(selectedConv.id); }}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-slate-400 hover:bg-amber-50 hover:text-amber-600 ${notes.length > 0 ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200"}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      title={selectedConv.is_pinned ? "ยกเลิก pin" : "Pin การสนทนา"}
                      onClick={() => void togglePin(selectedConv.id, selectedConv.is_pinned)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-slate-400 hover:bg-slate-50 hover:text-amber-500 ${selectedConv.is_pinned ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200"}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill={selectedConv.is_pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth={selectedConv.is_pinned ? 0 : 2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 12V4h1a1 1 0 000-2H7a1 1 0 000 2h1v8l-2 2v2h5v5l1 1 1-1v-5h5v-2l-2-2z"/>
                      </svg>
                    </button>
                    {selectedConv.lead_id ? (
                      <button
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 md:px-3 md:text-sm"
                        onClick={() => onLeadOpen?.(selectedConv.lead_id!)}
                      >
                        <span className="md:hidden">Lead ↗</span>
                        <span className="hidden md:inline">Lead linked ↗</span>
                      </button>
                    ) : (
                      <button
                        className="rounded-lg bg-brand-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-brand-900 md:px-3 md:text-sm"
                        onClick={() => openCreateLead(selectedConv)}
                      >
                        <span className="md:hidden">+ Lead</span>
                        <span className="hidden md:inline">+ Create Lead</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile-only: ad name strip */}
                {selectedConv.ad_name && (
                  <div className="border-t border-slate-100 px-3 py-1.5 md:hidden">
                    <span className="inline-block max-w-full truncate rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      🎯 {selectedConv.ad_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Tag bar */}
              <div className="shrink-0 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 min-h-[38px]">
                  {(selectedConv.conversation_tags ?? []).map(({ tag_id, tags: tag }) => {
                    if (!tag) return null;
                    const fullTag = tags.find((t) => t.id === tag.id);
                    const ownerProfile =
                      fullTag?.type === "personal" && fullTag.created_by && fullTag.created_by !== userId
                        ? profiles.find((p) => p.id === fullTag.created_by)
                        : null;
                    return (
                      <span key={tag_id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: tag.color }}>
                        {tag.name}{ownerProfile ? ` · ${ownerProfile.full_name ?? ownerProfile.email}` : ""}
                        <button onClick={() => void removeConvTag(selectedConv.id, tag_id)} className="opacity-70 hover:opacity-100 leading-none">×</button>
                      </span>
                    );
                  })}
                  <button
                    onClick={() => setShowTagPicker((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-slate-500 hover:text-slate-600"
                  >
                    {showTagPicker ? "ปิด" : "+ แท็ก"}
                  </button>
                </div>
                {showTagPicker && (() => {
                  const appliedIds = new Set((selectedConv.conversation_tags ?? []).map((ct) => ct.tag_id));
                  const available = tags.filter((t) => !appliedIds.has(t.id) && t.type === "global");
                  return (
                    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 bg-slate-50 px-4 py-2">
                      {available.length === 0 ? (
                        <span className="text-xs text-slate-400">ไม่มีแท็กที่เพิ่มได้</span>
                      ) : (
                        available.map((tag) => (
                          <button
                            key={tag.id}
                            onClick={() => void addConvTag(selectedConv.id, tag.id)}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-80"
                            style={{ backgroundColor: tag.color }}
                          >
                            + {tag.name}
                          </button>
                        ))
                      )}
                    </div>
                  );
                })()}
              </div>

              <div ref={messagesAreaRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                {(() => {
                  const lastOutboundIdx = (() => {
                    for (let i = messages.length - 1; i >= 0; i--) {
                      if (messages[i].direction === "outbound") return i;
                    }
                    return -1;
                  })();
                  return messages.map((msg, idx) => {
                  const isLastOutbound = idx === lastOutboundIdx;
                  const hasReplyAfter = lastOutboundIdx >= 0 && messages.slice(lastOutboundIdx + 1).some((m) => m.direction === "inbound");
                  const showReadReceipt =
                    isLastOutbound &&
                    (!!selectedConv?.customer_read_at || hasReplyAfter);
                  const msgDate = new Date(msg.created_at).toDateString();
                  const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at).toDateString() : null;
                  const showDateSep = msgDate !== prevDate;
                  const dateLabel = new Date(msg.created_at).toLocaleDateString("th-TH", {
                    day: "numeric", month: "long", year: "numeric",
                  });
                  const repliedMessage = msg.reply_to_message_id
                    ? messages.find((item) => item.id === msg.reply_to_message_id) ?? null
                    : null;
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
                    <div className={`group flex max-w-[72%] flex-col ${msg.direction === "outbound" ? "items-end" : "items-start"}`}>
                      {msg.direction === "inbound" && (
                        <button
                          type="button"
                          onClick={() => setReplyTarget(msg)}
                          className="mb-1 hidden rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 shadow-sm hover:border-brand-300 hover:text-brand-700 group-hover:inline-flex"
                        >
                          ↩ ตอบกลับ
                        </button>
                      )}
                      <div
                        onClick={() => {
                          if (msg.direction === "inbound") setReplyTarget(msg);
                        }}
                        className={`rounded-2xl px-3 py-2 text-sm ${
                          msg.direction === "outbound" ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-900"
                        } ${msg.direction === "inbound" ? "cursor-pointer" : ""}`}
                      >
                        {repliedMessage && (
                          <div
                            className={`mb-2 flex items-stretch gap-0 overflow-hidden rounded-lg text-xs ${
                              msg.direction === "outbound"
                                ? "bg-white/20 ring-1 ring-white/25"
                                : "bg-slate-200 ring-1 ring-slate-300"
                            }`}
                          >
                            <div
                              className={`w-[3px] shrink-0 ${
                                msg.direction === "outbound" ? "bg-white/70" : "bg-brand-500"
                              }`}
                            />
                            <div className="min-w-0 px-2.5 py-1.5">
                              <div
                                className={`mb-0.5 text-[10px] font-bold ${
                                  msg.direction === "outbound" ? "text-white" : "text-brand-600"
                                }`}
                              >
                                {repliedMessage.direction === "inbound"
                                  ? (selectedConv?.sender_name || "ลูกค้า")
                                  : "คุณ"}
                              </div>
                              <div
                                className={`line-clamp-2 leading-relaxed ${
                                  msg.direction === "outbound" ? "text-white/85" : "text-slate-600"
                                }`}
                              >
                                {repliedMessage.attachment_type === "image" ? "📷 รูปภาพ" : messagePreview(repliedMessage)}
                              </div>
                            </div>
                          </div>
                        )}
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
                  {isLastOutbound && (
                    <div className="flex justify-end pr-1">
                      <span className="text-[10px] text-slate-400">
                        {showReadReceipt
                          ? `อ่านแล้ว ${new Date(selectedConv!.customer_read_at!).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`
                          : "ส่งแล้ว ✓"}
                      </span>
                    </div>
                  )}
                  </div>
                  );
                  });
                })()}
                {messages.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">No messages yet</div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              <div className="shrink-0 border-t border-slate-200">
                {replyTarget && (
                  <div className="flex items-center gap-3 border-b border-slate-100 bg-brand-50 px-4 py-2">
                    <div className="h-8 w-0.5 shrink-0 rounded-full bg-brand-500" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-brand-600">
                        ตอบกลับ {replyTarget.direction === "inbound" ? (selectedConv?.sender_name || "ลูกค้า") : "คุณ"}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {replyTarget.attachment_type === "image" ? "📷 รูปภาพ" : messagePreview(replyTarget)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTarget(null)}
                      className="shrink-0 text-lg leading-none text-slate-400 hover:text-slate-700"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="flex gap-2 p-3">
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
                  title="อัปโหลดรูป"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </button>
                <button
                  title="รูปจากแอป"
                  disabled={busy}
                  onClick={() => {
                    setShowAppImages(true);
                    void loadAppImages(appImagesProject);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21zm8.25-7.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
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
                <div className="relative">
                  <button
                    title="Quick Reply"
                    onClick={() => { setShowQR((v) => !v); setQrDraft(null); }}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50 ${showQR ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200"}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </button>
                  {showQR && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowQR(false)} />
                      <div className="absolute bottom-full right-0 z-20 mb-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
                        <div className="border-b border-slate-100 px-4 py-2.5">
                          <p className="text-sm font-semibold text-slate-800">Quick Replies</p>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {quickReplies.length === 0 && (
                            <p className="px-4 py-6 text-center text-xs text-slate-400">ยังไม่มี — กด &quot;+ เพิ่ม&quot; เพื่อบันทึกข้อความ</p>
                          )}
                          {quickReplies.map((qr) => (
                            <div key={qr.id} className="group flex items-start gap-2 border-b border-slate-50 px-4 py-2.5 hover:bg-slate-50">
                              <button
                                className="flex-1 text-left"
                                onClick={() => { setReplyText(qr.content); setShowQR(false); }}
                              >
                                <div className="text-xs font-semibold text-slate-800">{qr.title}</div>
                                <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{qr.content}</div>
                              </button>
                              <button
                                onClick={() => void deleteQuickReply(qr.id)}
                                className="mt-0.5 shrink-0 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                        {qrDraft ? (
                          <div className="space-y-2 border-t border-slate-100 p-3">
                            <input
                              autoFocus
                              className="h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-600"
                              placeholder="ชื่อ shortcut (เช่น ทักทาย)"
                              value={qrDraft.title}
                              onChange={(e) => setQrDraft({ ...qrDraft, title: e.target.value })}
                            />
                            <textarea
                              className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-brand-600"
                              rows={3}
                              placeholder="ข้อความที่จะส่ง"
                              value={qrDraft.content}
                              onChange={(e) => setQrDraft({ ...qrDraft, content: e.target.value })}
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setQrDraft(null)} className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700">ยกเลิก</button>
                              <button
                                onClick={addQuickReply}
                                disabled={!qrDraft.title.trim() || !qrDraft.content.trim()}
                                className="rounded-lg bg-brand-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                              >
                                บันทึก
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setQrDraft({ title: "", content: "" })}
                            className="flex w-full items-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-xs font-medium text-brand-700 hover:bg-slate-50"
                          >
                            + เพิ่ม Quick Reply
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  className="rounded-lg bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busy || !replyText.trim()}
                  onClick={() => void sendReply()}
                >
                  {busy ? "…" : "Send"}
                </button>
              </div>
              </div>
            </div>
          ) : (
            <div className="hidden items-center justify-center text-sm text-slate-400 md:flex">
              Select a conversation to start chatting
            </div>
          )}
        </div>
      </section>

      {/* App Images Modal */}
      {showAppImages && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold text-slate-950">รูปจากแอป</h3>
              <button
                onClick={() => { setShowAppImages(false); setAppImagesFolder(null); setSelectedImgUrls([]); }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            {/* Project tabs */}
            <div className="flex border-b border-slate-200 px-5">
              {(["wela", "elysium"] as const).map((proj) => (
                <button
                  key={proj}
                  onClick={() => {
                    setAppImagesProject(proj);
                    setAppImagesFolder(null);
                    void loadAppImages(proj, null);
                  }}
                  className={`mr-5 border-b-2 py-2.5 text-sm font-medium capitalize transition-colors ${
                    appImagesProject === proj
                      ? "border-brand-700 text-brand-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {proj === "wela" ? "Wela" : "Elysium"}
                </button>
              ))}
            </div>
            {/* Breadcrumb */}
            {appImagesFolder && (
              <div className="flex items-center gap-1 border-b border-slate-100 px-5 py-2 text-sm">
                <button
                  onClick={() => { setAppImagesFolder(null); void loadAppImages(appImagesProject, null); }}
                  className="capitalize text-brand-600 hover:underline"
                >
                  {appImagesProject === "wela" ? "Wela" : "Elysium"}
                </button>
                <span className="text-slate-400">›</span>
                <span className="capitalize text-slate-700">{appImagesFolder.split("/").pop()}</span>
              </div>
            )}
            {/* Content */}
            <div className="p-5">
              {loadingAppImages ? (
                <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
              ) : appFolders.length === 0 && appImages.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  ไม่มีรูปภาพ — อัปโหลดรูปไปยัง Storage bucket &apos;project-images/{appImagesProject}/&apos; ก่อน
                </div>
              ) : (
                <>
                {appImages.length > 0 && (() => {
                  const allSelected = appImages.every((img) => selectedImgUrls.includes(img.url));
                  const someSelected = !allSelected && appImages.some((img) => selectedImgUrls.includes(img.url));
                  return (
                    <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-600 select-none">
                      <span
                        onClick={() => {
                          if (allSelected) {
                            setSelectedImgUrls((prev) => prev.filter((u) => !appImages.find((i) => i.url === u)));
                          } else {
                            const toAdd = appImages.map((i) => i.url).filter((u) => !selectedImgUrls.includes(u));
                            setSelectedImgUrls((prev) => [...prev, ...toAdd].slice(0, 10));
                          }
                        }}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                          allSelected ? "border-brand-600 bg-brand-600" : someSelected ? "border-brand-600 bg-brand-100" : "border-slate-300 bg-white"
                        }`}
                      >
                        {allSelected && (
                          <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {someSelected && <span className="h-1.5 w-1.5 rounded-sm bg-brand-600" />}
                      </span>
                      <span onClick={() => {
                        if (allSelected) {
                          setSelectedImgUrls((prev) => prev.filter((u) => !appImages.find((i) => i.url === u)));
                        } else {
                          const toAdd = appImages.map((i) => i.url).filter((u) => !selectedImgUrls.includes(u));
                          setSelectedImgUrls((prev) => [...prev, ...toAdd].slice(0, 10));
                        }
                      }}>
                        {allSelected ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"} ({appImages.length} รูป)
                      </span>
                    </label>
                  );
                })()}
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {/* Folders */}
                  {appFolders.map((folder) => (
                    <button
                      key={folder}
                      onClick={() => { const p = appImagesFolder ? `${appImagesFolder}/${folder}` : folder; setAppImagesFolder(p); void loadAppImages(appImagesProject, p); }}
                      className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
                      </svg>
                      <span className="max-w-full truncate px-1 text-xs font-medium capitalize">{folder}</span>
                    </button>
                  ))}
                  {/* Images */}
                  {appImages.map((img) => {
                    const isSelected = selectedImgUrls.includes(img.url);
                    return (
                      <div key={img.name} className="group relative aspect-square">
                        {/* Click image → send immediately */}
                        <button
                          disabled={busy}
                          onClick={() => { void sendImageByUrl(img.url); setShowAppImages(false); setAppImagesFolder(null); setSelectedImgUrls([]); }}
                          className="h-full w-full overflow-hidden rounded-lg border-2 border-transparent transition-colors hover:border-brand-600 focus:outline-none disabled:opacity-50"
                          title={img.name}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={img.name} loading="lazy" className="h-full w-full object-cover" />
                        </button>
                        {/* Checkbox → multi-select */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleImgSelection(img.url); }}
                          className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 shadow-sm transition-all ${
                            isSelected
                              ? "border-brand-600 bg-brand-600 text-white opacity-100"
                              : "border-white bg-white/80 text-transparent opacity-0 group-hover:opacity-100"
                          }`}
                          title="เลือกหลายรูป"
                        >
                          {isSelected && (
                            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                </>
              )}
            </div>
            {/* Multi-select confirm bar */}
            {selectedImgUrls.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
                <span className="text-sm text-slate-600">
                  เลือก <span className="font-semibold text-slate-800">{selectedImgUrls.length}</span> รูป
                  {selectedImgUrls.length >= 10 && <span className="ml-1 text-amber-600">(สูงสุด 10)</span>}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedImgUrls([])}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => void sendSelectedImages()}
                    disabled={busy}
                    className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    ส่ง {selectedImgUrls.length} รูป
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                  <label className="mb-1 block text-xs font-medium text-slate-600">เบอร์โทร *</label>
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
                disabled={submitting || !leadDraft.customer_name.trim() || !leadDraft.phone.trim()}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? "กำลังสร้าง…" : "สร้างลีด"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Internal Notes Modal */}
      {showNotesModal && selectedConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl" style={{ maxHeight: "80vh" }}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-900">บันทึกภายใน</h3>
                <p className="text-xs text-slate-400">{selectedConv.sender_name || selectedConv.sender_psid} · ลูกค้าไม่เห็นข้อความเหล่านี้</p>
              </div>
              <button
                onClick={() => setShowNotesModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Notes list */}
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {notesLoading ? (
                <p className="text-center text-sm text-slate-400">กำลังโหลด…</p>
              ) : notes.length === 0 ? (
                <p className="text-center text-sm text-slate-400">ยังไม่มีบันทึก</p>
              ) : (
                notes.map((note) => {
                  const author = profiles.find((p) => p.id === note.created_by);
                  const authorName = author?.full_name ?? author?.email ?? "ผู้ใช้งาน";
                  const createdAt = new Date(note.created_at).toLocaleString("th-TH", {
                    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                  });
                  const isOwn = note.created_by === userId;
                  return (
                    <div key={note.id} className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-amber-700">{authorName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400">{createdAt}</span>
                          {isOwn && (
                            <button
                              onClick={() => void deleteNote(note.id)}
                              className="text-[11px] text-slate-400 hover:text-rose-500"
                              title="ลบบันทึก"
                            >
                              ลบ
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{note.content}</p>
                    </div>
                  );
                })
              )}
            </div>

            {/* New note input */}
            <div className="border-t border-slate-200 px-5 py-4">
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400 resize-none"
                rows={3}
                placeholder="พิมพ์บันทึกภายใน…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void saveNote();
                }}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Ctrl+Enter เพื่อบันทึก</span>
                <button
                  onClick={() => void saveNote()}
                  disabled={noteSaving || !noteDraft.trim()}
                  className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {noteSaving ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
