export type TypingPresence = { typing: boolean; conversationId: string | null; name: string };
export type Typer = { userId: string; name: string };

const TYPING_EXPIRE_MS = 12_000;
const HEARTBEAT_MS = 3_000;
const PENDING_TIMEOUT_MS = 5_000;

export function collectTypers(
  state: Record<string, TypingPresence[]>,
  userId: string,
  lastSeen: Map<string, number>,
) {
  const now = Date.now();
  const result = new Map<string, Typer[]>();
  for (const [id, presences] of Object.entries(state)) {
    if (id === userId) continue;
    if (now - (lastSeen.get(id) ?? 0) > TYPING_EXPIRE_MS) continue;
    for (const presence of presences) {
      if (!presence.typing || !presence.conversationId) continue;
      const typers = result.get(presence.conversationId) ?? [];
      if (!typers.some((t) => t.userId === id)) typers.push({ userId: id, name: presence.name });
      result.set(presence.conversationId, typers);
    }
  }
  return result;
}

type PresenceChannel = {
  track: (payload: TypingPresence) => Promise<string>;
  untrack: () => Promise<string>;
};

export function createTypingController(channel: PresenceChannel) {
  let desired: TypingPresence | null = null;
  let published: TypingPresence | null | undefined;
  let ready = false;
  let disposed = false;
  let pending = false;
  let pendingSince: number | undefined;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  // Watchdog runs independently — catches hung requests even when heartbeat is cleared
  const watchdog = setInterval(() => {
    if (!pending || pendingSince === undefined) return;
    if (Date.now() - pendingSince <= PENDING_TIMEOUT_MS) return;
    // Invalidate the in-flight response so its result can't overwrite newer state
    generation += 1;
    pending = false;
    pendingSince = undefined;
    published = undefined;
    if (ready && !disposed) void flush();
  }, 1_000);

  async function flush() {
    if (!ready || disposed || pending || desired === published) return;
    clearTimeout(retryTimer);
    pending = true;
    pendingSince = Date.now();
    const target = desired;
    const connection = generation;
    let succeeded = false;
    try {
      const status = await (target ? channel.track(target) : channel.untrack());
      succeeded = status === "ok";
      if (connection === generation) published = succeeded ? target : undefined;
    } catch {
      if (connection === generation) published = undefined;
    } finally {
      // An old request must not clear a newer connection's pending request.
      if (connection === generation) {
        pending = false;
        pendingSince = undefined;
      }
    }
    if (connection !== generation) return; // Reconnect/watchdog owns the new request.
    if (succeeded || desired !== target) void flush();
    else if (ready && !disposed) retryTimer = setTimeout(() => void flush(), 1_000);
  }

  function stop(conversationId?: string) {
    if (disposed || (conversationId && desired?.conversationId !== conversationId)) return;
    clearTimeout(timer);
    clearInterval(heartbeat);
    timer = undefined;
    heartbeat = undefined;
    desired = null;
    void flush();
  }

  return {
    start(conversationId: string, name: string) {
      if (disposed || !conversationId) return;
      if (desired?.conversationId !== conversationId || desired.name !== name) {
        desired = { typing: true, conversationId, name };
        void flush();
      } else if (published !== desired) {
        // Previous track() failed — retry immediately on next keystroke
        void flush();
      }
      clearTimeout(timer);
      timer = setTimeout(() => stop(), 5_000);
      if (!heartbeat) {
        heartbeat = setInterval(() => {
          if (desired?.typing && ready && !disposed) {
            published = undefined;
            void flush();
          }
        }, HEARTBEAT_MS);
      }
    },
    stop,
    setReady(value: boolean) {
      if (disposed) return;
      ready = value;
      clearTimeout(retryTimer);
      generation += 1;
      // The previous connection may still have an unresolved track/untrack.
      // Invalidate its result and release its lock before publishing on this one.
      pending = false;
      pendingSince = undefined;
      published = undefined;
      void flush();
    },
    dispose() {
      disposed = true;
      ready = false;
      desired = null;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      clearInterval(heartbeat);
      clearInterval(watchdog);
      heartbeat = undefined;
    },
  };
}
