import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      webhookUrl: string;
      projectKey: string;
      customerName: string;
      phone: string;
      salesSuffix: string;
    };

    const { webhookUrl, projectKey, customerName, phone, salesSuffix } = body;

    if (!webhookUrl || !projectKey || !customerName || !phone || !salesSuffix) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "request_voucher",
        project_key: projectKey,
        name: customerName,
        phone: phone,
        sales: salesSuffix,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ ok: false, error: `GAS error: ${text}` }, { status: 502 });
    }

    const data = (await res.json().catch(() => ({ ok: true }))) as { ok?: boolean };
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
