import type { SupabaseClient } from "@supabase/supabase-js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export type MessengerSendMode = {
  mode: "response" | "human_agent";
  payload: { messaging_type: "RESPONSE" } | { messaging_type: "MESSAGE_TAG"; tag: "HUMAN_AGENT" };
};

export async function resolveMessengerSendMode(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<MessengerSendMode | { error: string }> {
  const { data: latestInbound } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestInbound?.created_at) {
    return { mode: "response", payload: { messaging_type: "RESPONSE" } };
  }

  const ageMs = Date.now() - new Date(String(latestInbound.created_at)).getTime();
  if (ageMs > SEVEN_DAYS_MS) {
    return { error: "Facebook reply window expired. Customer must send a new message first." };
  }

  if (ageMs > ONE_DAY_MS) {
    return { mode: "human_agent", payload: { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } };
  }

  return { mode: "response", payload: { messaging_type: "RESPONSE" } };
}

export function isFacebookAuthError(code?: number) {
  return code === 190 || code === 102 || code === 467;
}
