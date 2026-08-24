"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import {
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageSquareReply,
  RefreshCcw,
  Send,
} from "lucide-react";
import type { Page, PageComment, PageCommentReply } from "@/types/crm";

const supabase = createBrowserSupabase();

type CommentWithRelations = PageComment & {
  page?: { id: string; page_id: string; name: string } | null;
  replies?: PageCommentReply[];
};

type PostGroup = {
  key: string;
  fb_post_id: string;
  post_message: string | null;
  permalink_url: string | null;
  page_name: string;
  comments: CommentWithRelations[];
};

export function CommentCenter({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pages: _pages,
  userId,
  toast,
  onActiveCountChange,
}: {
  pages: Page[];
  userId: string;
  toast: (msg: string) => void;
  onActiveCountChange?: (count: number) => void;
}) {
  const [subTab, setSubTab] = useState<"active" | "archived">("active");
  const [comments, setComments] = useState<CommentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [privateReplyInputs, setPrivateReplyInputs] = useState<Record<string, string>>({});
  const [showPrivateReply, setShowPrivateReply] = useState<Record<string, boolean>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [collapsedPosts, setCollapsedPosts] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("page_comments")
      .select(
        "*, page:facebook_pages(id, page_id, name), replies:page_comment_replies(id, comment_id, message, fb_reply_id, created_by, created_at)",
      )
      .eq("status", subTab === "active" ? "active" : "archived")
      .order("created_at", { ascending: false })
      .limit(200);
    setComments((data ?? []) as CommentWithRelations[]);
    setLoading(false);
  }, [subTab]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("comment-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "page_comments" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "page_comment_replies" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function callAction(commentId: string, action: "reply" | "private_reply" | "archive", message?: string): Promise<boolean> {
    setBusy(commentId, true);
    try {
      const res = await fetch("/api/comments/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id: commentId, action, message, user_id: userId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) { toast(data.error ?? "เกิดข้อผิดพลาด"); return false; }
      return true;
    } catch {
      toast("เกิดข้อผิดพลาด");
      return false;
    } finally {
      setBusy(commentId, false);
    }
  }

  async function handleReply(comment: CommentWithRelations) {
    const msg = replyInputs[comment.id]?.trim();
    if (!msg) return;
    const ok = await callAction(comment.id, "reply", msg);
    if (ok) { setReplyInputs((p) => ({ ...p, [comment.id]: "" })); await load(); toast("ตอบ comment แล้ว"); }
  }

  async function handlePrivateReply(comment: CommentWithRelations) {
    const msg = privateReplyInputs[comment.id]?.trim();
    if (!msg) return;
    const ok = await callAction(comment.id, "private_reply", msg);
    if (ok) {
      setPrivateReplyInputs((p) => ({ ...p, [comment.id]: "" }));
      setShowPrivateReply((p) => ({ ...p, [comment.id]: false }));
      await load();
      toast("ส่ง DM แล้ว");
    }
  }

  async function handleArchive(comment: CommentWithRelations) {
    const ok = await callAction(comment.id, "archive");
    if (ok) { await load(); toast("สำเร็จ"); }
  }

  const activeCount = comments.length;
  useEffect(() => { onActiveCountChange?.(activeCount); }, [activeCount, onActiveCountChange]);

  // Group comments by post
  const groupedPosts = useMemo<PostGroup[]>(() => {
    const map = new Map<string, PostGroup>();
    for (const c of comments) {
      const key = c.fb_post_id || "__no_post__";
      if (!map.has(key)) {
        map.set(key, {
          key,
          fb_post_id: c.fb_post_id || "",
          post_message: c.post_message ?? null,
          permalink_url: c.permalink_url ?? null,
          page_name: (c.page as { name?: string } | null)?.name ?? "Unknown Page",
          comments: [],
        });
      }
      map.get(key)!.comments.push(c);
    }
    // Sort groups by latest comment in group
    return [...map.values()].sort((a, b) => {
      const at = a.comments[0]?.created_at ?? "";
      const bt = b.comments[0]?.created_at ?? "";
      return bt.localeCompare(at);
    });
  }, [comments]);

  function togglePost(key: string) {
    setCollapsedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function timeAgo(dateStr: string | null) {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "เมื่อกี้";
    if (m < 60) return `${m} นาทีที่แล้ว`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ชม.ที่แล้ว`;
    return new Date(dateStr).toLocaleDateString("th-TH");
  }

  function initials(name: string | null) {
    if (!name) return "?";
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      {/* Sub-tab header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex gap-1">
          {(["active", "archived"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                subTab === tab ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab === "active" ? "Active" : "Archive"}
              {tab === "active" && activeCount > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {subTab === "active" && groupedPosts.length > 0 && (
            <span>{groupedPosts.length} โพส · {activeCount} comment</span>
          )}
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
          >
            <RefreshCcw size={13} />
            รีเฟรช
          </button>
        </div>
      </div>

      {/* Grouped comment list */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <p className="pt-8 text-center text-sm text-slate-400">กำลังโหลด…</p>
        ) : groupedPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-slate-400">
            <MessageSquareReply size={40} className="mb-3 opacity-30" />
            <p className="text-sm">{subTab === "active" ? "ไม่มี comment ใหม่" : "ไม่มีรายการใน Archive"}</p>
          </div>
        ) : (
          groupedPosts.map((group) => {
            const isCollapsed = collapsedPosts.has(group.key);
            const pendingCount = group.comments.length;

            return (
              <div key={group.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {/* Post group header */}
                <button
                  onClick={() => togglePost(group.key)}
                  className="flex w-full items-center gap-3 border-b border-slate-100 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100"
                >
                  <span className="text-base">📌</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">{group.page_name}</span>
                      {group.permalink_url && (
                        <a
                          href={group.permalink_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-200"
                        >
                          <ExternalLink size={10} />
                          ดูโพส
                        </a>
                      )}
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {pendingCount} comment{subTab === "active" ? " ค้างตอบ" : ""}
                      </span>
                    </div>
                    {group.post_message && (
                      <p className="mt-0.5 truncate text-xs text-slate-600" title={group.post_message}>
                        {group.post_message}
                      </p>
                    )}
                  </div>
                  {isCollapsed ? <ChevronDown size={16} className="shrink-0 text-slate-400" /> : <ChevronUp size={16} className="shrink-0 text-slate-400" />}
                </button>

                {/* Comments in this post */}
                {!isCollapsed && (
                  <div className="divide-y divide-slate-100">
                    {group.comments.map((comment) => {
                      const isBusy = busyIds.has(comment.id);
                      const replyVal = replyInputs[comment.id] ?? "";
                      const privateVal = privateReplyInputs[comment.id] ?? "";
                      const showPR = showPrivateReply[comment.id] ?? false;
                      const commentReplies = (comment.replies ?? []) as PageCommentReply[];

                      return (
                        <div key={comment.id} className="px-4 py-3">
                          {/* Comment header */}
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                              {initials(comment.from_user_name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-slate-900">{comment.from_user_name ?? "ผู้ใช้งาน"}</span>
                                {comment.status === "archived" && comment.archive_reason && (
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${comment.archive_reason === "chat" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                                    {comment.archive_reason === "chat" ? "เปิดแชทแล้ว" : "สำเร็จ"}
                                  </span>
                                )}
                                {comment.private_reply_sent && comment.status === "active" && (
                                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">ส่ง DM แล้ว</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400">{timeAgo(comment.fb_created_time ?? comment.created_at)}</p>
                            </div>
                          </div>

                          {/* Comment text */}
                          <p className="mt-2 text-sm leading-relaxed text-slate-800">{comment.message ?? "(ไม่มีข้อความ)"}</p>

                          {/* Replies thread */}
                          {commentReplies.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {commentReplies.map((reply) => (
                                <div key={reply.id} className="flex items-start gap-2">
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">RP</div>
                                  <div className="flex-1 rounded-lg bg-brand-50 px-3 py-2 text-xs text-slate-800">{reply.message}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Actions — active only */}
                          {comment.status === "active" && (
                            <div className="mt-2 space-y-2">
                              <div className="flex gap-2">
                                <input
                                  className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                                  placeholder="ตอบ comment…"
                                  value={replyVal}
                                  disabled={isBusy}
                                  onChange={(e) => setReplyInputs((p) => ({ ...p, [comment.id]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) void handleReply(comment); }}
                                />
                                <button
                                  onClick={() => void handleReply(comment)}
                                  disabled={isBusy || !replyVal.trim()}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white disabled:opacity-40"
                                >
                                  <Send size={14} />
                                </button>
                              </div>

                              {showPR ? (
                                <div className="flex gap-2">
                                  <input
                                    className="h-9 flex-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm outline-none focus:border-emerald-500"
                                    placeholder="ข้อความ DM (ส่งครั้งเดียว)…"
                                    value={privateVal}
                                    disabled={isBusy}
                                    onChange={(e) => setPrivateReplyInputs((p) => ({ ...p, [comment.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") void handlePrivateReply(comment); }}
                                  />
                                  <button
                                    onClick={() => void handlePrivateReply(comment)}
                                    disabled={isBusy || !privateVal.trim()}
                                    className="flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white disabled:opacity-40"
                                  >
                                    <Send size={12} />ส่ง DM
                                  </button>
                                  <button
                                    onClick={() => setShowPrivateReply((p) => ({ ...p, [comment.id]: false }))}
                                    className="h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-500"
                                  >
                                    ยกเลิก
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setShowPrivateReply((p) => ({ ...p, [comment.id]: true }))}
                                    disabled={isBusy || comment.private_reply_sent}
                                    className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <MessageSquareReply size={13} />เปิด Chat
                                  </button>
                                  <button
                                    onClick={() => void handleArchive(comment)}
                                    disabled={isBusy}
                                    className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-medium text-white disabled:opacity-40"
                                  >
                                    <CheckCheck size={13} />สำเร็จ
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
