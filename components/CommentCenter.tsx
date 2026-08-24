"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import {
  ArrowLeft,
  CheckCheck,
  ExternalLink,
  MessageSquareReply,
  RefreshCcw,
  Send,
} from "lucide-react";
import type { Page, PageComment, PageCommentReply } from "@/types/crm";

const supabase = createBrowserSupabase();

type CommentRow = PageComment & {
  page?: { id: string; page_id: string; name: string } | null;
  replies?: PageCommentReply[];
};

type PostCache = {
  fb_post_id: string;
  page_id: string;
  post_message: string | null;
  permalink_url: string | null;
  thumbnail_url: string | null;
  fb_created_at: string | null;
};

type ThreadStatus = "pending" | "replied" | "done";

type Thread = {
  from_user_id: string | null;
  from_user_name: string | null;
  comments: CommentRow[];
  status: ThreadStatus;
  latestAt: string;
};

type PostGroup = {
  fb_post_id: string;
  cache: PostCache | null;
  page_name: string;
  threads: Thread[];
  latestCommentAt: string;
};

function threadStatus(comments: CommentRow[]): ThreadStatus {
  if (comments.some((c) => c.status === "active")) return "pending";
  if (comments.every((c) => c.archive_reason === "done")) return "done";
  return "replied";
}

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
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [postCaches, setPostCaches] = useState<PostCache[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [privateReplyInputs, setPrivateReplyInputs] = useState<Record<string, string>>({});
  const [showPrivateReply, setShowPrivateReply] = useState<Record<string, boolean>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data: cmts } = await supabase
      .from("page_comments")
      .select("*, page:facebook_pages(id,page_id,name), replies:page_comment_replies(id,comment_id,message,fb_reply_id,created_by,created_at)")
      .order("created_at", { ascending: false })
      .limit(500);

    const rows = (cmts ?? []) as CommentRow[];
    setComments(rows);

    // Fetch post cache for all unique post IDs
    const postIds = [...new Set(rows.map((c) => c.fb_post_id).filter(Boolean))] as string[];
    if (postIds.length > 0) {
      const { data: caches } = await supabase
        .from("fb_post_cache")
        .select("fb_post_id,page_id,post_message,permalink_url,thumbnail_url,fb_created_at")
        .in("fb_post_id", postIds);
      setPostCaches((caches ?? []) as PostCache[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("comment-center-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "page_comments" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "page_comment_replies" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  function setBusy(id: string, val: boolean) {
    setBusyIds((p) => { const n = new Set(p); if (val) n.add(id); else n.delete(id); return n; });
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
    } catch { toast("เกิดข้อผิดพลาด"); return false; }
    finally { setBusy(commentId, false); }
  }

  async function handleReply(comment: CommentRow) {
    const msg = replyInputs[comment.id]?.trim();
    if (!msg) return;
    const ok = await callAction(comment.id, "reply", msg);
    if (ok) { setReplyInputs((p) => ({ ...p, [comment.id]: "" })); await load(); toast("ตอบ comment แล้ว"); }
  }

  async function handlePrivateReply(comment: CommentRow) {
    const msg = privateReplyInputs[comment.id]?.trim();
    if (!msg) return;
    const ok = await callAction(comment.id, "private_reply", msg);
    if (ok) {
      setPrivateReplyInputs((p) => ({ ...p, [comment.id]: "" }));
      setShowPrivateReply((p) => ({ ...p, [comment.id]: false }));
      await load(); toast("ส่ง DM แล้ว");
    }
  }

  async function handleArchive(comment: CommentRow) {
    const ok = await callAction(comment.id, "archive");
    if (ok) { await load(); toast("สำเร็จ"); }
  }

  // Build post groups with thread stats
  const postGroups = useMemo<PostGroup[]>(() => {
    const cacheMap = new Map(postCaches.map((c) => [c.fb_post_id, c]));
    const groupMap = new Map<string, PostGroup>();

    for (const c of comments) {
      const postId = c.fb_post_id || "__unknown__";
      if (!groupMap.has(postId)) {
        const cache = cacheMap.get(postId) ?? null;
        const pageName = (c.page as { name?: string } | null)?.name ?? "Unknown Page";
        groupMap.set(postId, { fb_post_id: postId, cache, page_name: pageName, threads: [], latestCommentAt: c.created_at });
      }
      const group = groupMap.get(postId)!;
      if (c.created_at > group.latestCommentAt) group.latestCommentAt = c.created_at;

      // Add to thread (group by from_user_id)
      const userId = c.from_user_id ?? `__anon_${c.id}`;
      const existing = group.threads.find((t) => t.from_user_id === userId);
      if (existing) {
        existing.comments.push(c);
        if (c.created_at > existing.latestAt) existing.latestAt = c.created_at;
      } else {
        group.threads.push({ from_user_id: c.from_user_id, from_user_name: c.from_user_name, comments: [c], status: "pending", latestAt: c.created_at });
      }
    }

    // Compute thread statuses
    for (const group of groupMap.values()) {
      for (const thread of group.threads) {
        thread.status = threadStatus(thread.comments);
      }
    }

    return [...groupMap.values()].sort((a, b) => b.latestCommentAt.localeCompare(a.latestCommentAt));
  }, [comments, postCaches]);

  const pendingThreadTotal = useMemo(() =>
    postGroups.reduce((sum, g) => sum + g.threads.filter((t) => t.status === "pending").length, 0),
    [postGroups]
  );

  useEffect(() => { onActiveCountChange?.(pendingThreadTotal); }, [pendingThreadTotal, onActiveCountChange]);

  function timeAgo(dateStr: string | null) {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "เมื่อกี้";
    if (m < 60) return `${m} นาทีที่แล้ว`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ชม.ที่แล้ว`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} วันที่แล้ว`;
    return new Date(dateStr).toLocaleDateString("th-TH");
  }

  function initials(name: string | null) {
    if (!name) return "?";
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }

  const selectedGroup = selectedPostId ? postGroups.find((g) => g.fb_post_id === selectedPostId) : null;

  // ─── Thread Detail View ───────────────────────────────────────────────────
  if (selectedGroup) {
    const pendingThreads = selectedGroup.threads.filter((t) => t.status === "pending");
    const otherThreads = selectedGroup.threads.filter((t) => t.status !== "pending");

    return (
      <div className="flex h-full flex-col overflow-hidden bg-slate-50">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button onClick={() => setSelectedPostId(null)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <ArrowLeft size={15} /> กลับ
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{selectedGroup.cache?.post_message ?? selectedGroup.fb_post_id}</p>
            <p className="text-xs text-slate-400">{selectedGroup.page_name}</p>
          </div>
          {selectedGroup.cache?.permalink_url && (
            <a href={selectedGroup.cache.permalink_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
              <ExternalLink size={13} /> เปิดใน Facebook
            </a>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Pending threads first */}
          {pendingThreads.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">ค้างตอบ ({pendingThreads.length})</p>
              {pendingThreads.map((thread) => <ThreadCard key={thread.from_user_id} thread={thread} busyIds={busyIds} replyInputs={replyInputs} setReplyInputs={setReplyInputs} privateReplyInputs={privateReplyInputs} setPrivateReplyInputs={setPrivateReplyInputs} showPrivateReply={showPrivateReply} setShowPrivateReply={setShowPrivateReply} handleReply={handleReply} handlePrivateReply={handlePrivateReply} handleArchive={handleArchive} timeAgo={timeAgo} initials={initials} />)}
            </div>
          )}
          {/* Other threads */}
          {otherThreads.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">ตอบแล้ว / ไม่ต้องตอบ ({otherThreads.length})</p>
              {otherThreads.map((thread) => <ThreadCard key={thread.from_user_id} thread={thread} busyIds={busyIds} replyInputs={replyInputs} setReplyInputs={setReplyInputs} privateReplyInputs={privateReplyInputs} setPrivateReplyInputs={setPrivateReplyInputs} showPrivateReply={showPrivateReply} setShowPrivateReply={setShowPrivateReply} handleReply={handleReply} handlePrivateReply={handlePrivateReply} handleArchive={handleArchive} timeAgo={timeAgo} initials={initials} />)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Post Card List View ──────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Comment Center</span>
          {pendingThreadTotal > 0 && (
            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">{pendingThreadTotal} ค้างตอบ</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {postGroups.length > 0 && <span>{postGroups.length} โพส</span>}
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
            <RefreshCcw size={13} /> รีเฟรช
          </button>
        </div>
      </div>

      {/* Post card list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="pt-8 text-center text-sm text-slate-400">กำลังโหลด…</p>
        ) : postGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-slate-400">
            <MessageSquareReply size={40} className="mb-3 opacity-30" />
            <p className="text-sm">ยังไม่มี comment ที่รับรู้</p>
          </div>
        ) : (
          postGroups.map((group) => {
            const pending = group.threads.filter((t) => t.status === "pending").length;
            const replied = group.threads.filter((t) => t.status === "replied").length;
            const done = group.threads.filter((t) => t.status === "done").length;
            const total = group.threads.length;

            return (
              <button
                key={group.fb_post_id}
                onClick={() => setSelectedPostId(group.fb_post_id)}
                className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm text-left hover:border-brand-300 hover:shadow-md transition-all"
              >
                <div className="flex gap-0">
                  {/* Thumbnail */}
                  {group.cache?.thumbnail_url ? (
                    <img src={group.cache.thumbnail_url} alt="" className="h-32 w-28 shrink-0 object-cover" />
                  ) : (
                    <div className="flex h-32 w-28 shrink-0 items-center justify-center bg-slate-100 text-2xl">📢</div>
                  )}

                  {/* Info */}
                  <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
                    <div>
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">{group.page_name}</span>
                        {group.cache?.fb_created_at && (
                          <span className="text-[10px] text-slate-400">{timeAgo(group.cache.fb_created_at)}</span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-sm text-slate-700">
                        {group.cache?.post_message ?? "(ไม่มีข้อความโพส)"}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="mt-2 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-slate-400">คอมเมนต์ทั้งหมด {total} thread</span>
                        <span className="text-[10px] text-slate-300">·</span>
                        <span className="text-[10px] text-slate-400">ล่าสุด {timeAgo(group.latestCommentAt)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {pending > 0 && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">⏳ ค้างตอบ {pending}</span>
                        )}
                        {replied > 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">✅ ตอบแล้ว {replied}</span>
                        )}
                        {done > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">— ไม่ต้องตอบ {done}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
                  <span className="text-xs text-brand-600 font-medium">ดูและตอบ comment →</span>
                  {group.cache?.permalink_url && (
                    <a
                      href={group.cache.permalink_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      <ExternalLink size={11} /> เปิดใน Facebook
                    </a>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── ThreadCard component ─────────────────────────────────────────────────────
function ThreadCard({
  thread,
  busyIds,
  replyInputs, setReplyInputs,
  privateReplyInputs, setPrivateReplyInputs,
  showPrivateReply, setShowPrivateReply,
  handleReply, handlePrivateReply, handleArchive,
  timeAgo, initials,
}: {
  thread: Thread;
  busyIds: Set<string>;
  replyInputs: Record<string, string>;
  setReplyInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  privateReplyInputs: Record<string, string>;
  setPrivateReplyInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showPrivateReply: Record<string, boolean>;
  setShowPrivateReply: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleReply: (c: CommentRow) => Promise<void>;
  handlePrivateReply: (c: CommentRow) => Promise<void>;
  handleArchive: (c: CommentRow) => Promise<void>;
  timeAgo: (d: string | null) => string;
  initials: (n: string | null) => string;
}) {
  // Use the latest active comment for reply actions; show all messages in thread
  const activeComments = thread.comments.filter((c) => c.status === "active");
  const latestActive = activeComments[0] ?? null;
  const threadKey = thread.from_user_id ?? thread.comments[0]?.id ?? "unknown";
  const isBusy = latestActive ? busyIds.has(latestActive.id) : false;
  const replyVal = latestActive ? (replyInputs[latestActive.id] ?? "") : "";
  const privateVal = latestActive ? (privateReplyInputs[latestActive.id] ?? "") : "";
  const showPR = latestActive ? (showPrivateReply[latestActive.id] ?? false) : false;

  const statusColor = {
    pending: "border-rose-200 bg-rose-50",
    replied: "border-emerald-200 bg-emerald-50",
    done: "border-slate-200 bg-white",
  }[thread.status];

  return (
    <div className={`rounded-xl border p-3 ${statusColor}`}>
      {/* Thread header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-300 text-xs font-bold text-slate-700">
          {initials(thread.from_user_name)}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-900">{thread.from_user_name ?? "ผู้ใช้งาน"}</span>
          <span className="ml-2 text-xs text-slate-400">{timeAgo(thread.latestAt)}</span>
        </div>
        {thread.status === "pending" && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">ค้างตอบ</span>}
        {thread.status === "replied" && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">ตอบแล้ว</span>}
        {thread.status === "done" && <span className="rounded-full bg-slate-300 px-2 py-0.5 text-[10px] text-slate-600">ไม่ต้องตอบ</span>}
      </div>

      {/* All messages in thread */}
      <div className="space-y-1.5 mb-2">
        {[...thread.comments].reverse().map((c) => (
          <div key={c.id} className="text-sm text-slate-800 leading-relaxed">
            <span className={c.status === "active" ? "font-medium" : "text-slate-500"}>{c.message ?? "(ไม่มีข้อความ)"}</span>
            {/* Inline replies from CRM */}
            {((c.replies ?? []) as PageCommentReply[]).map((r) => (
              <div key={r.id} className="mt-1 ml-4 flex items-start gap-1.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[9px] font-bold text-brand-700">RP</div>
                <span className="rounded-lg bg-brand-50 px-2 py-1 text-xs text-slate-700">{r.message}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Actions — only if pending */}
      {thread.status === "pending" && latestActive && (
        <div className="space-y-2 border-t border-rose-100 pt-2">
          <div className="flex gap-2">
            <input
              className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-600"
              placeholder="ตอบ comment…"
              value={replyVal}
              disabled={isBusy}
              onChange={(e) => setReplyInputs((p) => ({ ...p, [latestActive.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) void handleReply(latestActive); }}
            />
            <button
              onClick={() => void handleReply(latestActive)}
              disabled={isBusy || !replyVal.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </div>
          {showPR ? (
            <div className="flex gap-2">
              <input
                className="h-9 flex-1 rounded-lg border border-emerald-300 bg-white px-3 text-sm outline-none focus:border-emerald-500"
                placeholder="ข้อความ DM (ส่งครั้งเดียว)…"
                value={privateVal}
                disabled={isBusy}
                onChange={(e) => setPrivateReplyInputs((p) => ({ ...p, [latestActive.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") void handlePrivateReply(latestActive); }}
              />
              <button onClick={() => void handlePrivateReply(latestActive)} disabled={isBusy || !privateVal.trim()}
                className="flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white disabled:opacity-40">
                <Send size={12} />ส่ง DM
              </button>
              <button onClick={() => setShowPrivateReply((p) => ({ ...p, [latestActive.id]: false }))}
                className="h-9 rounded-lg border border-slate-200 px-2 text-xs text-slate-500">ยกเลิก</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowPrivateReply((p) => ({ ...p, [latestActive.id]: true }))}
                disabled={isBusy || latestActive.private_reply_sent}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
              >
                <MessageSquareReply size={13} />เปิด Chat
              </button>
              <button onClick={() => void handleArchive(latestActive)} disabled={isBusy}
                className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-slate-700 px-3 text-xs font-medium text-white disabled:opacity-40">
                <CheckCheck size={13} />ไม่ต้องตอบ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
