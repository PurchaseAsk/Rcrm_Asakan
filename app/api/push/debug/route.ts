import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  console.log("[push-debug]", JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
