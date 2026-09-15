import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function requireChatSettingsEditor(request: Request, supabase: SupabaseClient) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return { userId: null, error: NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }) };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { userId: null, error: NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "team_lead"].includes(profile.role)) {
    return { userId: null, error: NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไข Auto-Reply" }, { status: 403 }) };
  }
  return { userId: user.id, error: null };
}
