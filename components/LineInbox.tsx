"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { LineConversation, LineMessage, LineOaAccount } from "@/types/crm";

const supabase = createBrowserSupabase();
const PAGE_SIZE = 30;

function isLineUnread(conv: LineConversation): boolean {
  if (conv.last_message_direction === "outbound") return false;
  if (!conv.last_read_at) return true;
  return new Date(conv.last_message_at) > new Date(conv.last_read_at);
}

export function LineInbox({
  userId,
  toast,
  onUnreadCountChange,
}: {
  userId: string;
  toast: (msg: string) => void;
  onUnreadCountChange?: (count: number) => void;
}) {
  const [oaAccounts, setOaAccounts] = useState<LineOaAccount[]>([]);
  const [filterOaId, setFilterOaId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<LineConversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LineMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedConvIdRef = useRef<string | null>(null);
  const filterOaIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { filterOaIdRef.current = filterOaId; }, [filterOaId]);

  useEffect(() => { selectedConvIdRef.current = selectedConvId; }, [selectedConvId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    void supabase
      .from("line_oa_accounts")
      .select("id, name, channel_id, is_active, bot_user_id")
      .eq("is_active", true)
      .then(({ data }) => setOaAccounts((data ?? []) as LineOaAccount[]));
  }, []);

  useEffect(() => {
    void loadPage(0);

    const channel = supabase
      .channel("line-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "line_messages" }, async (payload) => {
        const convId = (payload.new as { conversation_id: string }).conversation_id;
        if (convId === selectedConvIdRef.current) {
          await refreshMessages(convId);
          const now = new Date().toISOString();
          void supabase.from("line_conversations").update({ last_read_at: now }).eq("id", convId);
          setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, last_read_at: now } : c));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "line_conversations" }, async () => {
        await loadPage(0);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "line_conversations" }, (payload) => {
        const u = payload.new as LineConversation;
        setConversations((prev) =>
          prev.map((c) => c.id === u.id ? { ...c, ...u } : c)
            .sort((a, b) => {
              if (a.is_pinned && !b.is_pinned) return -1;
              if (!a.is_pinned && b.is_pinned) return 1;
              return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
            })
        );
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPage(page: number, append = false, oaId?: string | null) {
    const from = page * PAGE_SIZE;
    const oaFilter = oaId !== undefined ? oaId : filterOaIdRef.current;
    let query = supabase
      .from("line_conversations")
      .select("*, line_oa_accounts(name)", { count: "exact" })
      .order("is_pinned", { ascending: false })
      .order("last_message_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (oaFilter) query = query.eq("line_oa_id", oaFilter);

    const { data, count } = await query;
    if (count !== null) setTotal(count);
    const rows = (data || []) as LineConversation[];
    setConversations((prev) => {
      if (!append) return rows;
      const seen = new Set(prev.map((c) => c.id));
      return [...prev, ...rows.filter((c) => !seen.has(c.id))];
    });
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    setTotal(null);
    void loadPage(0, false, filterOaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOaId]);

  async function loadMore() {
    if (loadingMore || (total !== null && conversations.length >= total)) return;
    setLoadingMore(true);
    try {
      const nextPage = Math.floor(conversations.length / PAGE_SIZE);
      await loadPage(nextPage, true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function refreshMessages(convId: string) {
    const { data } = await supabase
      .from("line_messages")
      .select("*, profiles(id, full_name, email)")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages((data || []) as LineMessage[]);
  }

  async function openConversation(conv: LineConversation) {
    setSelectedConvId(conv.id);
    setMessages([]);
    await refreshMessages(conv.id);
    const now = new Date().toISOString();
    void supabase.from("line_conversations").update({ last_read_at: now }).eq("id", conv.id);
    setConversations((prev) => prev.map((c) => c.id === conv.id ? { ...c, last_read_at: now } : c));
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedConvId) return;
    const text = replyText.trim();
    const convId = selectedConvId;
    const tempId = `opt-${Date.now()}`;
    const now = new Date().toISOString();

    const optimistic: LineMessage = {
      id: tempId,
      conversation_id: convId,
      direction: "outbound",
      content: text,
      created_at: now,
      attachment_type: null,
      attachment_url: null,
      line_message_id: null,
      sent_by: userId,
      profiles: null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setReplyText("");
    setConversations((prev) => prev.map((c) =>
      c.id === convId ? { ...c, last_message_text: text, last_message_direction: "outbound", last_message_at: now } : c,
    ));

    try {
      const res = await fetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: convId, text, sent_by: userId }),
      });
      const result = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setReplyText(text);
        toast(result.error ?? "ส่งไม่สำเร็จ");
        return;
      }
      await refreshMessages(convId);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setReplyText(text);
      toast("ส่งไม่สำเร็จ");
    }
  }

  async function sendImage(file: File) {
    if (!selectedConvId) return;
    const convId = selectedConvId;
    const tempId = `opt-${Date.now()}`;
    const now = new Date().toISOString();
    const blobUrl = URL.createObjectURL(file);

    const optimistic: LineMessage = {
      id: tempId,
      conversation_id: convId,
      direction: "outbound",
      content: null,
      created_at: now,
      attachment_type: "image",
      attachment_url: blobUrl,
      line_message_id: null,
      sent_by: userId,
      profiles: null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setConversations((prev) => prev.map((c) =>
      c.id === convId ? { ...c, last_message_text: "[รูปภาพ]", last_message_direction: "outbound", last_message_at: now } : c,
    ));

    try {
      const form = new FormData();
      form.append("conversation_id", convId);
      form.append("file", file);
      if (userId) form.append("sent_by", userId);
      const res = await fetch("/api/line/send-image", { method: "POST", body: form });
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

  async function markHandled(convId: string) {
    await supabase.from("line_conversations").update({ last_message_direction: "outbound" }).eq("id", convId);
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, last_message_direction: "outbound" } : c));
  }

  async function togglePin(convId: string, pinned: boolean) {
    const next = !pinned;
    await supabase.from("line_conversations").update({ is_pinned: next }).eq("id", convId);
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, is_pinned: next } : c)
        .sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
        })
    );
  }

  const unreadCount = conversations.filter(isLineUnread).length;
  const hasMore = total === null || conversations.length < total;
  const selectedConv = conversations.find((c) => c.id === selectedConvId) ?? null;

  useEffect(() => { onUnreadCountChange?.(unreadCount); }, [unreadCount, onUnreadCountChange]);

  return (
    <section className="overflow-hidden border-t border-slate-200 bg-white">
      <div className="grid h-[calc(100dvh-56px)] min-h-[500px] md:grid-cols-[340px_1fr]">
        {/* Left: conversation list */}
        <div className={`flex min-h-0 flex-col overflow-hidden border-r border-slate-200 ${selectedConvId ? "hidden md:flex" : "flex"}`}>
          <div className="shrink-0 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-[#06C755]">LINE</span>
                <h2 className="font-semibold text-slate-950">Inbox</h2>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-[#06C755] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
              {oaAccounts.length > 1 && (
                <select
                  className="h-7 max-w-[140px] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-[#06C755] focus:outline-none"
                  value={filterOaId ?? ""}
                  onChange={(e) => setFilterOaId(e.target.value || null)}
                >
                  <option value="">ทุก OA</option>
                  {oaAccounts.map((oa) => (
                    <option key={oa.id} value={oa.id}>{oa.name}</option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {conversations.length}{total !== null && hasMore ? ` of ${total}` : ""} conversations
            </p>
          </div>

          <div
            className="flex-1 overflow-y-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) void loadMore();
            }}
          >
            {loading ? (
              <div className="p-4 text-center text-sm text-slate-400">Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                <p className="font-medium">ยังไม่มีแชท LINE</p>
                <p className="mt-1">ตั้งค่า LINE OA Webhook URL ใน LINE Developer Console ก่อน</p>
              </div>
            ) : (
              <>
                {conversations.map((conv) => {
                  const unread = isLineUnread(conv);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => void openConversation(conv)}
                      className={`w-full border-b border-slate-100 p-3 text-left hover:bg-slate-50 ${
                        conv.id === selectedConvId ? "border-l-2 border-l-[#06C755] bg-green-50/30" : unread ? "bg-blue-50/40" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          {conv.picture_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={conv.picture_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#06C755] text-sm font-bold text-white">
                              {(conv.display_name ?? conv.sender_line_id)[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={`truncate text-sm ${unread ? "font-semibold text-slate-950" : "font-medium text-slate-900"}`}>
                              {conv.display_name ?? conv.sender_line_id}
                            </div>
                            <div className="truncate text-[11px] text-slate-400">{conv.line_oa_accounts?.name}</div>
                            {conv.last_message_text && (
                              <div className={`mt-0.5 truncate text-xs ${unread ? "font-medium text-slate-700" : "text-slate-400"}`}>
                                {conv.last_message_text}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <div className={`text-[10px] text-right ${unread ? "font-medium text-blue-600" : "text-slate-400"}`}>
                            <div>{new Date(conv.last_message_at).toLocaleDateString("th-TH")}</div>
                            <div>{new Date(conv.last_message_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            {conv.is_pinned && <span className="text-amber-500 text-[10px]">📌</span>}
                            {conv.last_message_direction === "outbound" ? (
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">ตอบแล้ว ✓</span>
                            ) : unread ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">●</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {hasMore && (
                  <div className="p-3 text-center text-xs text-slate-400">
                    {loadingMore ? "Loading…" : "Scroll for more"}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: messages */}
        {selectedConv ? (
          <div className="flex min-h-0 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-3">
                <button className="text-sm text-slate-500 hover:text-slate-800 md:hidden" onClick={() => setSelectedConvId(null)}>
                  ← Back
                </button>
                {selectedConv.picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedConv.picture_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#06C755] text-sm font-bold text-white">
                    {(selectedConv.display_name ?? selectedConv.sender_line_id).charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-semibold text-slate-950">{selectedConv.display_name ?? selectedConv.sender_line_id}</div>
                  <div className="text-xs text-slate-500">{selectedConv.line_oa_accounts?.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedConv.last_message_direction === "inbound" && (
                  <button
                    onClick={() => void markHandled(selectedConv.id)}
                    className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    ✓ จบแชท
                  </button>
                )}
                <button
                  title={selectedConv.is_pinned ? "ยกเลิก pin" : "Pin"}
                  onClick={() => void togglePin(selectedConv.id, selectedConv.is_pinned)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border text-slate-400 hover:bg-slate-50 ${selectedConv.is_pinned ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200"}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill={selectedConv.is_pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth={selectedConv.is_pinned ? 0 : 2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 12V4h1a1 1 0 000-2H7a1 1 0 000 2h1v8l-2 2v2h5v5l1 1 1-1v-5h5v-2l-2-2z"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {(() => {
                const lastOutboundIdx = (() => {
                  for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].direction === "outbound") return i;
                  }
                  return -1;
                })();
                return messages.map((msg, idx) => {
                  const isLastOutbound = idx === lastOutboundIdx;
                  const msgDate = new Date(msg.created_at).toDateString();
                  const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at).toDateString() : null;
                  const showDate = msgDate !== prevDate;
                  const dateLabel = new Date(msg.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="my-2 flex items-center gap-3">
                          <div className="flex-1 border-t border-slate-200" />
                          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-0.5 text-[11px] text-slate-500">{dateLabel}</span>
                          <div className="flex-1 border-t border-slate-200" />
                        </div>
                      )}
                      <div className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm ${msg.direction === "outbound" ? "bg-[#06C755] text-white" : "bg-slate-100 text-slate-900"}`}>
                          {msg.attachment_type === "image" && msg.attachment_url ? (
                            <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={msg.attachment_url} alt="attachment" className="max-w-[240px] rounded-xl" />
                            </a>
                          ) : msg.attachment_type === "image" ? (
                            <p className="italic text-xs opacity-70">[รูปภาพ]</p>
                          ) : msg.attachment_type ? (
                            <p className="italic text-xs opacity-70">[{msg.attachment_type}]</p>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                          <p className={`mt-1 text-[10px] ${msg.direction === "outbound" ? "text-green-100" : "text-slate-400"}`}>
                            {msg.direction === "outbound" && msg.profiles && (
                              <span className="mr-1">{msg.profiles.full_name ?? msg.profiles.email}</span>
                            )}
                            {new Date(msg.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                      {isLastOutbound && (
                        <div className="flex justify-end pr-1">
                          <span className="text-[10px] text-slate-400">ส่งแล้ว ✓</span>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              {messages.length === 0 && <div className="py-8 text-center text-sm text-slate-400">ยังไม่มีข้อความ</div>}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply */}
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
                title="อัปโหลดรูป"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </button>
              <input
                className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#06C755] disabled:opacity-50"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
                placeholder="พิมพ์ข้อความ… (Enter to send)"
                disabled={busy}
              />
              <button
                className="rounded-lg bg-[#06C755] px-4 text-sm font-medium text-white disabled:opacity-50"
                disabled={busy || !replyText.trim()}
                onClick={() => void sendReply()}
              >
                {busy ? "…" : "Send"}
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden items-center justify-center text-sm text-slate-400 md:flex">
            เลือกแชทเพื่อเริ่มสนทนา
          </div>
        )}
      </div>
    </section>
  );
}
