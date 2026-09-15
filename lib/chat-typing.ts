export type TypingPresence = { typing: boolean; conversationId: string | null; name: string };
export type Typer = { userId: string; name: string };

export function collectTypers(state: Record<string, TypingPresence[]>, userId: string) {
  const result = new Map<string, Typer[]>();
  for (const [id, presences] of Object.entries(state)) {
    if (id === userId) continue;
    for (const presence of presences) {
      if (!presence.typing || !presence.conversationId) continue;
      const typers = result.get(presence.conversationId) ?? [];
      if (!typers.some((typer) => typer.userId === id)) {
        typers.push({ userId: id, name: presence.name });
      }
      result.set(presence.conversationId, typers);
    }
  }
  return result;
}

type PresenceChannel = {
  track: (payload: TypingPresence) => Promise<string>;
  untrack: () => Promise<string>;
};

// One publisher per Inbox, shared by its main and floating composers.
export function createTypingController(channel: PresenceChannel) {
  let desired: TypingPresence | null = null;
  let published: TypingPresence | null | undefined;
  let ready = false;
  let disposed = false;
  let pending = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

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
    // Serialize updates so a slow start cannot overtake a stop or room change.
    // Failed starts retry on input/reconnect. Failed stops also retry while idle.
    if (succeeded || desired !== target || connection !== generation) void flush();
    else if (!target && ready && !disposed) retryTimer = setTimeout(() => void flush(), 1000);
  }

  function stop(conversationId?: string) {
    if (disposed || (conversationId && desired?.conversationId !== conversationId)) return;
    clearTimeout(timer);
    timer = undefined;
    desired = null;
    void flush();
  }

  return {
    start(conversationId: string, name: string) {
      if (disposed || !conversationId) return;
      if (desired?.conversationId !== conversationId || desired.name !== name) {
        desired = { typing: true, conversationId, name };
      }
      clearTimeout(timer);
      timer = setTimeout(() => stop(), 3000);
      void flush();
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
      // The owner removes this exact channel, which removes its presence too.
    },
  };
}
