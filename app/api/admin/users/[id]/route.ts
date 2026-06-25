import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function requireAdmin(request: NextRequest): Promise<boolean> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return false;
  const supabase = adminSupabase();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await request.json()) as { action: string; role?: string };
  const supabase = adminSupabase();

  if (body.action === "reset_password") {
    const password = generatePassword();
    const { error } = await supabase.auth.admin.updateUserById(id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, password });
  }

  if (body.action === "update_role" && body.role) {
    const { error } = await supabase.from("profiles").update({ role: body.role }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "disable") {
    const [authRes, dbRes] = await Promise.all([
      supabase.auth.admin.updateUserById(id, { ban_duration: "876600h" }),
      supabase.from("profiles").update({ is_active: false }).eq("id", id),
    ]);
    if (authRes.error) return NextResponse.json({ error: authRes.error.message }, { status: 400 });
    if (dbRes.error) return NextResponse.json({ error: dbRes.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "enable") {
    const [authRes, dbRes] = await Promise.all([
      supabase.auth.admin.updateUserById(id, { ban_duration: "none" }),
      supabase.from("profiles").update({ is_active: true }).eq("id", id),
    ]);
    if (authRes.error) return NextResponse.json({ error: authRes.error.message }, { status: 400 });
    if (dbRes.error) return NextResponse.json({ error: dbRes.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
