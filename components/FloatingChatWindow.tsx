"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Conversation, Message } from "@/types/crm";

const supabase = createBrowserSupabase();

const AVATAR_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#14b8a6","#f59e0b"];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const WIN_W = 340;
const WIN_H = 480;
const WIN_H_MIN = 48;

export function FloatingChatWindow({
  conv,
  index,
  userId,
  toast,
  onClose,
}: {
  conv: Conversation;
  index: number;
  userId: string;
  toast: (msg: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Set initial position after mount so window dimensions are available
  useEffect(() => {
    const margin = 16;
    const gap = 8;
    const x = Math.max(margin, window.innerWidth - WIN_W - margin - index * (WIN_W + gap));
    const y = Math.max(margin, window.innerHeight - WIN_H - margin - 56);
    setPos({ x, y });
  }, [index]);

  useEffect(() => {
    void loadMessages();
    const channel = supabase
      .channel(`float-${conv.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` },
        () => void loadMessages(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);

  useEffect(() => {
    if (!minimized) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, minimized]);

  async function loadMessages() {
    const { data } = await supabase
      .from("messages")
      .select("*, profiles(id, full_name, email)")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(60);
    setMessages((data || []) as Message[]);
  }

  async function sendReply() {
    if (!replyText.trim()) return;
    const text = replyText.trim();
    setReplyText("");
    try {
      const res = await fetch("/api/facebook/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conv.id, text, sent_by: userId }),
      });
      if (!res.ok) {
        const result = (await res.json()) as { error?: string };
        toast(result.error ?? "ส่งไม่สำเร็จ");
        setReplyText(text);
      } else {
        await loadMessages();
      }
    } catch {
      toast("ส่งไม่สำเร็จ");
      setReplyText(text);
    }
  }

  function onDragStart(e: React.MouseEvent) {
    e.preventDefault();
    if (!pos) return;
    const { x: startPosX, y: startPosY } = pos;
    const startX = e.clientX;
    const startY = e.clientY;
    dragRef.current = { startX, startY, startPosX, startPosY };

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - WIN_W, dragRef.current.startPosX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - WIN_H_MIN, dragRef.current.startPosY + dy)),
      });
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (!pos) return null;

  const displayName = conv.sender_name || conv.sender_psid;

  return (
    <div
      className="hidden md:flex flex-col fixed z-[200] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: WIN_W,
        height: minimized ? WIN_H_MIN : WIN_H,
        transition: "height 0.15s ease",
      }}
    >
      {/* Drag handle / header */}
      <div
        onMouseDown={onDragStart}
        className="flex h-12 shrink-0 cursor-grab items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 select-none active:cursor-grabbing"
      >
        {conv.picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={conv.picture_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: avatarColor(displayName) }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{displayName}</div>
          {conv.facebook_pages?.name && (
            <div className="truncate text-[10px] text-slate-400">{conv.facebook_pages.name}</div>
          )}
        </div>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setMinimized((v) => !v)}
          title={minimized ? "ขยาย" : "ย่อ"}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        >
          {minimized ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          title="ปิด"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-rose-100 hover:text-rose-500"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!minimized && (
        <>
          {/* Messages area */}
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-400">ยังไม่มีข้อความ</p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    msg.direction === "outbound" ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-900"
                  }`}
                >
                  {msg.attachment_type === "image" && msg.attachment_url ? (
                    <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={msg.attachment_url} alt="attachment" className="max-w-[200px] rounded-xl" />
                    </a>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                  <p className={`mt-0.5 text-[10px] ${msg.direction === "outbound" ? "text-blue-200" : "text-slate-400"}`}>
                    {msg.direction === "outbound" && msg.profiles && (
                      <span className="mr-1">{msg.profiles.full_name ?? msg.profiles.email}</span>
                    )}
                    {new Date(msg.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply input */}
          <div className="shrink-0 border-t border-slate-200 p-2">
            <div className="flex gap-1.5">
              <input
                className="h-9 flex-1 rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-brand-600"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendReply();
                  }
                }}
                placeholder="พิมพ์ข้อความ… (Enter ส่ง)"
              />
              <button
                disabled={!replyText.trim()}
                onClick={() => void sendReply()}
                className="shrink-0 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white disabled:opacity-40"
              >
                ส่ง
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
