export type TypingPresence = { typing: boolean; conversationId: string | null; name: string };
export type Typer = { userId: string; name: string };

const TYPING_EXPIRE_MS = 8_000;

// lastSeen: receiver-side map of userId → timestamp of last sync that included active typing.
// Using receiver's own clock eliminates clock-skew between sender and receiver.
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
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  async function flush() {
    if (!ready || disposed || pending || desired === published) return;
    clearTimeout(retryTimer);
    pending = true;
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
      pending = false;
    }
    if (succeeded || desired !== target || connection !== generation) void flush();
    else if (!target && ready && !disposed) retryTimer = setTimeout(() => void flush(), 1000);
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
      // Only create new desired (and trigger flush) when conversation or name changes.
      // Repeated keystrokes on the same conversation skip flush — desired === published guard handles it.
      if (desired?.conversationId !== conversationId || desired.name !== name) {
        desired = { typing: true, conversationId, name };
        void flush();
      }
      clearTimeout(timer);
      timer = setTimeout(() => stop(), 3000);
      // Heartbeat: force re-track every 5s so receiver's lastSeen stays fresh even with no keystrokes.
      if (!heartbeat) {
        heartbeat = setInterval(() => {
          if (desired?.typing && ready && !disposed) {
            published = undefined; // force re-track with same payload to refresh receiver lastSeen
            void flush();
          }
        }, 5_000);
      }
    },
    stop,
    setReady(value: boolean) {
      if (disposed) return;
      ready = value;
      clearTimeout(retryTimer);
      generation += 1;
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
      heartbeat = undefined;
    },
  };
}
