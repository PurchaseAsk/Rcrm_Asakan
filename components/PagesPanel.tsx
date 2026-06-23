"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Page, Team } from "@/types/crm";
import { deleteRow, toggleBoolean } from "@/lib/helpers";
import { DataTable } from "@/components/ui/DataTable";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { RowActions } from "@/components/ui/RowActions";

const supabase = createBrowserSupabase();

export function PagesPanel({
  pages,
  teams,
  userId,
  reload,
  toast,
}: {
  pages: Page[];
  teams: Team[];
  userId: string;
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [form, setForm] = useState({ name: "", page_id: "", token: "" });
  const [busy, setBusy] = useState(false);
  const [managingPage, setManagingPage] = useState<Page | null>(null);
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>([]);
  const [savingTeams, setSavingTeams] = useState(false);
  const [editingTokenPageId, setEditingTokenPageId] = useState<string | null>(null);
  const [editingToken, setEditingToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [pixelModal, setPixelModal] = useState<{ pageId: string; pixelId: string; capiToken: string } | null>(null);
  const [savingPixel, setSavingPixel] = useState(false);

  async function createPage() {
    if (!form.name.trim() || !form.page_id.trim()) return toast("Page name and Page ID are required");
    setBusy(true);
    try {
      const { error } = await supabase
        .from("facebook_pages")
        .insert({ ...form, owner_id: userId, is_active: true });
      if (error) {
        toast(error.message);
        return;
      }
      setForm({ name: "", page_id: "", token: "" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function openTeamModal(page: Page) {
    setManagingPage(page);
    const { data } = await supabase.from("page_teams").select("team_id").eq("page_id", page.id);
    setAssignedTeamIds((data ?? []).map((r: { team_id: string }) => r.team_id));
  }

  async function saveTeams() {
    if (!managingPage) return;
    setSavingTeams(true);
    try {
      await supabase.from("page_teams").delete().eq("page_id", managingPage.id);
      if (assignedTeamIds.length > 0) {
        await supabase
          .from("page_teams")
          .insert(assignedTeamIds.map((tid) => ({ page_id: managingPage.id, team_id: tid })));
      }
      toast("บันทึกสิทธิ์ทีมแล้ว");
      setManagingPage(null);
    } finally {
      setSavingTeams(false);
    }
  }

  async function saveToken() {
    if (!editingTokenPageId || !editingToken.trim()) return;
    setSavingToken(true);
    try {
      const { error } = await supabase
        .from("facebook_pages")
        .update({ token: editingToken.trim() })
        .eq("id", editingTokenPageId);
      if (error) { toast(error.message); return; }
      toast("บันทึก Token แล้ว");
      setEditingTokenPageId(null);
      setEditingToken("");
      await reload();
    } finally {
      setSavingToken(false);
    }
  }

  async function savePixel() {
    if (!pixelModal) return;
    setSavingPixel(true);
    try {
      const { error } = await supabase
        .from("facebook_pages")
        .update({ pixel_id: pixelModal.pixelId.trim() || null, capi_token: pixelModal.capiToken.trim() || null })
        .eq("id", pixelModal.pageId);
      if (error) { toast(error.message); return; }
      toast("บันทึก Pixel settings แล้ว");
      setPixelModal(null);
      await reload();
    } finally {
      setSavingPixel(false);
    }
  }

  function toggleTeam(teamId: string) {
    setAssignedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId],
    );
  }

  return (
    <Panel title="Facebook pages">
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_1fr_120px]">
        <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <Field label="Page ID" value={form.page_id} onChange={(value) => setForm({ ...form, page_id: value })} />
        <Field label="Page token" value={form.token} onChange={(value) => setForm({ ...form, token: value })} />
        <div className="flex items-end">
          <button
            className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={createPage}
          >
            {busy ? "Working…" : "Create"}
          </button>
        </div>
      </div>
      <DataTable
        headers={["Name", "Page ID", "Status", "Inbox Teams", "Token", "Pixel / CAPI", "Actions"]}
        rows={pages.map((page) => [
          page.name,
          page.page_id,
          page.is_active ? "Active" : "Off",
          <button
            key={`pt-${page.id}`}
            onClick={() => void openTeamModal(page)}
            className="rounded px-2 py-1 text-xs text-brand-700 underline hover:text-brand-900"
          >
            กำหนดทีม
          </button>,
          <button
            key={`tk-${page.id}`}
            onClick={() => { setEditingTokenPageId(page.id); setEditingToken(""); }}
            className="rounded px-2 py-1 text-xs text-emerald-700 underline hover:text-emerald-900"
          >
            {(page as Page & { token?: string }).token ? "เปลี่ยน Token" : "ตั้ง Token"}
          </button>,
          <button
            key={`px-${page.id}`}
            onClick={() => setPixelModal({ pageId: page.id, pixelId: page.pixel_id ?? "", capiToken: page.capi_token ?? "" })}
            className="rounded px-2 py-1 text-xs text-violet-700 underline hover:text-violet-900"
          >
            {page.pixel_id ? `Pixel: ${page.pixel_id.slice(0, 8)}…` : "ตั้ง Pixel"}
          </button>,
          <RowActions
            key={page.id}
            isActive={page.is_active}
            onToggle={() => toggleBoolean("facebook_pages", page.id, "is_active", !page.is_active, reload, toast)}
            onDelete={() => deleteRow("facebook_pages", page.id, reload, toast)}
          />,
        ])}
      />

      {editingTokenPageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 font-semibold text-slate-950">ตั้งค่า Page Access Token</h3>
            <p className="mb-4 text-sm text-slate-500">
              วาง Long-lived Page Access Token ที่ได้จาก Graph API Explorer
            </p>
            <textarea
              className="w-full rounded-lg border border-slate-200 p-3 text-xs font-mono text-slate-800 focus:border-brand-600 focus:outline-none"
              rows={4}
              placeholder="EAAxxxxxxxxxxxxxxx..."
              value={editingToken}
              onChange={(e) => setEditingToken(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setEditingTokenPageId(null); setEditingToken(""); }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => void saveToken()}
                disabled={savingToken || !editingToken.trim()}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingToken ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pixelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 font-semibold text-slate-950">Pixel & Conversions API</h3>
            <p className="mb-1 text-sm text-slate-500">
              ดู Pixel ID และสร้าง CAPI token ได้ที่{" "}
              <a href="https://www.facebook.com/events_manager" target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                Facebook Events Manager
              </a>
            </p>
            <p className="mb-4 text-xs text-slate-400">Events Manager → เลือก Pixel → Settings → Conversions API → Generate access token</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Pixel ID</label>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono outline-none focus:border-brand-600"
                  placeholder="123456789012345"
                  value={pixelModal.pixelId}
                  onChange={(e) => setPixelModal({ ...pixelModal, pixelId: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">CAPI Access Token</label>
                <textarea
                  className="w-full rounded-lg border border-slate-200 p-3 text-xs font-mono text-slate-800 focus:border-brand-600 focus:outline-none"
                  rows={3}
                  placeholder="EAAxxxxxxxxxxxxxxx..."
                  value={pixelModal.capiToken}
                  onChange={(e) => setPixelModal({ ...pixelModal, capiToken: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPixelModal(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">ยกเลิก</button>
              <button
                onClick={() => void savePixel()}
                disabled={savingPixel}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingPixel ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {managingPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 font-semibold text-slate-950">กำหนดทีมสำหรับ Inbox</h3>
            <p className="mb-4 text-sm text-slate-500">
              เพจ: <span className="font-medium">{managingPage.name}</span>
              <br />
              ถ้าไม่เลือกทีม = ทุกคนเห็น
            </p>
            <div className="mb-4 space-y-2">
              {teams.length === 0 ? (
                <p className="text-sm text-slate-400">ยังไม่มีทีม</p>
              ) : (
                teams.map((team) => (
                  <label
                    key={team.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={assignedTeamIds.includes(team.id)}
                      onChange={() => toggleTeam(team.id)}
                      className="h-4 w-4 rounded border-slate-300 accent-brand-700"
                    />
                    <span className="text-sm font-medium text-slate-800">{team.name}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setManagingPage(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => void saveTeams()}
                disabled={savingTeams}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingTeams ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
