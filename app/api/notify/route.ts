import { NextRequest, NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    type: "lead" | "chat";
    name?: string;
    phone?: string;
    page_name?: string;
    pipeline_name?: string;
    message?: string;
  };

  if (body.type === "lead") {
    const parts = [
      `👤 <b>ลีดใหม่ (Chat Inbox)</b>`,
      `👤 ${body.name ?? "ไม่ระบุชื่อ"}`,
      body.phone ? `📞 ${body.phone}` : null,
      body.page_name ? `📄 ${body.page_name}` : null,
      body.pipeline_name ? `📋 ${body.pipeline_name}` : null,
    ].filter(Boolean);
    await sendTelegram(parts.join("\n"));
  }

  return NextResponse.json({ ok: true });
}
