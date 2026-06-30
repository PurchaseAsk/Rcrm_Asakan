function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("[telegram] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }
  const appUrl = process.env.APP_URL;
  const fullText = appUrl ? `${text}\n\n🔗 <a href="${appUrl}">เปิด CRM</a>` : text;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: fullText, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error("[telegram] API error", JSON.stringify(err));
    }
  } catch (e) {
    console.error("[telegram] fetch error", e);
  }
}

export function tg(s: string | null | undefined): string {
  return escHtml(s ?? "");
}
