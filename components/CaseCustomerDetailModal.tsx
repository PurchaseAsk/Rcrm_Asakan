"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { BankAccepted, Case } from "@/types/crm";

const supabase = createBrowserSupabase();

const BANKS = [
  "กสิกรไทย (KBank)",
  "ไทยพาณิชย์ (SCB)",
  "กรุงเทพ (BBL)",
  "กรุงไทย (KTB)",
  "กรุงศรี (BAY)",
  "ทีทีบี (TTB)",
  "ออมสิน (GSB)",
  "ธอส. (GHB)",
  "UOB",
  "CIMB",
];

function fmt(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toLocaleString("th-TH");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

function numOrNull(s: string): number | null {
  const v = parseFloat(s.replace(/,/g, ""));
  return isNaN(v) ? null : v;
}

/* ─── compact summary (shown in drawer) ─── */
export function CaseCustomerDetailSummary({
  caseItem,
  disabled,
  onOpen,
}: {
  caseItem: Case;
  disabled?: boolean;
  onOpen: () => void;
}) {
  const hasSalary = caseItem.main_salary != null;
  const hasLoanAmount = caseItem.loan_amount != null;
  const hasDocs = !!caseItem.docs_submitted_at;
  const banks = (caseItem.bank_accepted ?? []).filter((b) => b.bank && b.date);

  return (
    <button
      className="flex w-full items-start gap-3 text-left"
      onClick={onOpen}
      disabled={disabled}
    >
      <span className="shrink-0 text-xs text-slate-500 pt-0.5">ข้อมูลลูกค้า:</span>
      <div className="flex flex-wrap gap-1.5">
        {hasSalary && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
            💰 รายได้ {fmt(caseItem.main_salary)} ฿
          </span>
        )}
        {hasLoanAmount && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            🏷️ วงเงิน {fmt(caseItem.loan_amount)} ฿
          </span>
        )}
        {caseItem.has_co_borrower && (
          <span className="rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-xs text-violet-600">
            +กู้ร่วม
          </span>
        )}
        {hasDocs && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            📄 ยื่นเอกสาร {fmtDate(caseItem.docs_submitted_at)}
          </span>
        )}
        {banks.map((b, i) => (
          <span key={i} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            🏦 {b.bank} รับเคส {fmtDate(b.date)}
          </span>
        ))}
        {!hasSalary && !hasDocs && banks.length === 0 && (
          <span className="text-xs text-slate-400 italic">
            {disabled ? "—" : "คลิกเพื่อเพิ่มข้อมูล"}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─── modal ─── */
export function CaseCustomerDetailModal({
  caseItem,
  userId,
  onClose,
  onSaved,
}: {
  caseItem: Case;
  userId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [mainSalary, setMainSalary] = useState(fmt(caseItem.main_salary));
  const [mainDebt, setMainDebt] = useState(fmt(caseItem.main_debt));
  const [loanAmount, setLoanAmount] = useState(fmt(caseItem.loan_amount));
  const [hasCo, setHasCo] = useState(caseItem.has_co_borrower);
  const [coSalary, setCoSalary] = useState(fmt(caseItem.co_salary));
  const [coDebt, setCoDebt] = useState(fmt(caseItem.co_debt));

  const [docsSubmitted, setDocsSubmitted] = useState(!!caseItem.docs_submitted_at);
  const [docsDate, setDocsDate] = useState(caseItem.docs_submitted_at ?? "");

  const initBanks = (): { bank: string; date: string; checked: boolean }[] => {
    const existing = caseItem.bank_accepted ?? [];
    return [0, 1, 2].map((i) => ({
      bank: existing[i]?.bank ?? "",
      date: existing[i]?.date ?? "",
      checked: !!(existing[i]?.bank && existing[i]?.date),
    }));
  };
  const [bankRows, setBankRows] = useState(initBanks);

  const [busy, setBusy] = useState(false);

  function setBankRow(i: number, patch: Partial<{ bank: string; date: string; checked: boolean }>) {
    setBankRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);

    const newMainSalary = numOrNull(mainSalary);
    const newMainDebt = numOrNull(mainDebt);
    const newLoanAmount = numOrNull(loanAmount);
    const newCoSalary = hasCo ? numOrNull(coSalary) : null;
    const newCoDebt = hasCo ? numOrNull(coDebt) : null;
    const newDocsDate = docsSubmitted ? docsDate || null : null;
    const newBankAccepted: BankAccepted[] = bankRows
      .filter((r) => r.checked && r.bank && r.date)
      .map((r) => ({ bank: r.bank, date: r.date }));

    await supabase.from("cases").update({
      main_salary: newMainSalary,
      main_debt: newMainDebt,
      loan_amount: newLoanAmount,
      has_co_borrower: hasCo,
      co_salary: newCoSalary,
      co_debt: newCoDebt,
      docs_submitted_at: newDocsDate,
      bank_accepted: newBankAccepted,
    }).eq("id", caseItem.id);

    // Build activity notes
    const notes: string[] = ["📋 อัพเดทข้อมูลลูกค้า"];

    if (newDocsDate && newDocsDate !== caseItem.docs_submitted_at) {
      notes.push(`📄 ยื่นเอกสารแล้ววันที่ ${fmtDate(newDocsDate)}`);
    }

    const prevBanks = caseItem.bank_accepted ?? [];
    for (const b of newBankAccepted) {
      const prev = prevBanks.find((p) => p.bank === b.bank);
      if (!prev || prev.date !== b.date) {
        notes.push(`🏦 ${b.bank} รับเคสแล้ววันที่ ${fmtDate(b.date)}`);
      }
    }

    await supabase.from("case_activities").insert({
      case_id: caseItem.id,
      type: "note",
      content: notes.join("\n"),
      created_by: userId,
    });

    await onSaved();
    setBusy(false);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-base font-bold text-slate-900">รายละเอียดทางการเงินลูกค้า</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {/* ── ผู้กู้หลัก ── */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">ผู้กู้หลัก</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-500">เงินเดือน (บาท)</span>
                <input
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
                  placeholder="เช่น 35,000"
                  value={mainSalary}
                  onChange={(e) => setMainSalary(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">ภาระหนี้ (บาท/เดือน)</span>
                <input
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
                  placeholder="เช่น 8,000"
                  value={mainDebt}
                  onChange={(e) => setMainDebt(e.target.value)}
                />
              </label>
            </div>
            <label className="mt-3 block space-y-1">
              <span className="text-xs text-slate-500">วงเงินขออนุมัติ (บาท)</span>
              <input
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
                placeholder="เช่น 2,500,000"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
              />
            </label>
          </section>

          {/* ── กู้ร่วม ── */}
          <section>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-brand-700"
                checked={hasCo}
                onChange={(e) => setHasCo(e.target.checked)}
              />
              <span className="text-sm font-medium text-slate-700">มีผู้กู้ร่วม</span>
            </label>
            {hasCo && (
              <div className="mt-2.5 grid grid-cols-2 gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">เงินเดือนกู้ร่วม (บาท)</span>
                  <input
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-400"
                    placeholder="เช่น 25,000"
                    value={coSalary}
                    onChange={(e) => setCoSalary(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">ภาระหนี้ (บาท/เดือน)</span>
                  <input
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-400"
                    placeholder="เช่น 3,000"
                    value={coDebt}
                    onChange={(e) => setCoDebt(e.target.value)}
                  />
                </label>
              </div>
            )}
          </section>

          <hr className="border-slate-100" />

          {/* ── ยื่นเอกสาร ── */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">สถานะเอกสาร</p>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-brand-700"
                checked={docsSubmitted}
                onChange={(e) => setDocsSubmitted(e.target.checked)}
              />
              <span className="text-sm text-slate-700">ลูกค้ายื่นเอกสารแล้ว</span>
            </label>
            {docsSubmitted && (
              <div className="mt-2">
                <label className="text-xs text-slate-500">วันที่ยื่นเอกสาร</label>
                <input
                  type="date"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
                  value={docsDate}
                  onChange={(e) => setDocsDate(e.target.value)}
                />
              </div>
            )}
          </section>

          {/* ── ธนาคารรับเคส ── */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">ธนาคารรับเคส (สูงสุด 3 แห่ง)</p>
            <datalist id="bank-list-detail">
              {BANKS.map((b) => <option key={b} value={b} />)}
            </datalist>
            <div className="space-y-2.5">
              {bankRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-700"
                    checked={row.checked}
                    onChange={(e) => setBankRow(i, { checked: e.target.checked })}
                  />
                  <input
                    list="bank-list-detail"
                    className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-brand-400 focus:bg-white disabled:opacity-40"
                    placeholder={`ธนาคารที่ ${i + 1}`}
                    value={row.bank}
                    disabled={!row.checked}
                    onChange={(e) => setBankRow(i, { bank: e.target.value })}
                  />
                  <input
                    type="date"
                    className="h-9 w-36 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-brand-400 focus:bg-white disabled:opacity-40"
                    value={row.date}
                    disabled={!row.checked}
                    onChange={(e) => setBankRow(i, { date: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => void save()}
            disabled={busy}
            className="rounded-lg bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
