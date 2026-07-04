"use client";

import { useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import type { StageQuestion, StageRule } from "@/types/crm";

type Answers = Record<string, string | string[]>;

function getValue(answers: Answers, id: string): string {
  const v = answers[id];
  return typeof v === "string" ? v : "";
}

function getChecked(answers: Answers, id: string): string[] {
  const v = answers[id];
  return Array.isArray(v) ? v : [];
}

function hasAnyAnswer(answers: Answers, questions: StageQuestion[]): boolean {
  return questions.some((q) => {
    const v = answers[q.id];
    if (!v) return false;
    if (typeof v === "string") return v.trim() !== "";
    return v.length > 0;
  });
}

function formatAnswers(answers: Answers, questions: StageQuestion[]): string {
  return questions
    .map((q) => {
      const v = answers[q.id];
      if (!v) return null;
      const val = Array.isArray(v) ? v.join(", ") : v.trim();
      if (!val) return null;
      return `${q.label}: ${val}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function StageChangeNoteModal({
  stageName,
  stageRule,
  onCancel,
  onConfirm,
}: {
  stageName: string;
  stageRule: StageRule | null;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState<Answers>({});

  const hasRule = stageRule && stageRule.questions.length > 0;
  const questions = stageRule?.questions ?? [];

  const canConfirm = hasRule
    ? hasAnyAnswer(answers, questions)
    : note.trim() !== "";

  function handleConfirm() {
    if (!canConfirm) return;
    const result = hasRule ? formatAnswers(answers, questions) : note.trim();
    onConfirm(result);
  }

  function setTextAnswer(id: string, val: string) {
    setAnswers((prev) => ({ ...prev, [id]: val }));
  }

  function setRadioAnswer(id: string, val: string) {
    setAnswers((prev) => ({ ...prev, [id]: val }));
  }

  function toggleCheckbox(id: string, option: string) {
    setAnswers((prev) => {
      const cur = getChecked(prev, id);
      const next = cur.includes(option) ? cur.filter((v) => v !== option) : [...cur, option];
      return { ...prev, [id]: next };
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <MessageSquareText size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-950">
                {hasRule ? "บันทึกก่อนย้าย" : "Stage change note"}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                ย้ายลีดไปยัง <span className="font-medium text-slate-700">{stageName}</span>
              </p>
            </div>
          </div>
          <button
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onCancel}
          >
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {hasRule ? (
            <div className="space-y-5">
              {questions.map((q) => (
                <div key={q.id}>
                  <p className="mb-2 text-sm font-medium text-slate-700">{q.label}</p>

                  {q.type === "text" && (
                    <textarea
                      className="min-h-20 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                      value={getValue(answers, q.id)}
                      onChange={(e) => setTextAnswer(q.id, e.target.value)}
                      placeholder="พิมพ์ที่นี่…"
                    />
                  )}

                  {q.type === "date" && (
                    <input
                      type="date"
                      className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                      value={getValue(answers, q.id)}
                      onChange={(e) => setTextAnswer(q.id, e.target.value)}
                    />
                  )}

                  {q.type === "radio" && (
                    <div className="space-y-2">
                      {(q.options ?? []).map((opt) => (
                        <label key={opt} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                          <input
                            type="radio"
                            name={q.id}
                            value={opt}
                            checked={getValue(answers, q.id) === opt}
                            onChange={() => setRadioAnswer(q.id, opt)}
                            className="accent-brand-600"
                          />
                          <span className="text-sm text-slate-800">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === "checkbox" && (
                    <div className="space-y-2">
                      {(q.options ?? []).map((opt) => {
                        const checked = getChecked(answers, q.id).includes(opt);
                        return (
                          <label key={opt} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCheckbox(q.id, opt)}
                              className="accent-brand-600"
                            />
                            <span className="text-sm text-slate-800">{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-slate-400">กรอกอย่างน้อย 1 ช่อง แล้วกด "ยืนยัน"</p>
            </div>
          ) : (
            <div>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Required note</span>
                <textarea
                  autoFocus
                  className="mt-1 min-h-28 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น โทรติดต่อลูกค้าแล้ว / นัดเข้าชมวันที่ 16/6/2569"
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">ระบบจะบันทึกข้อความนี้ลง Activity ของลีด</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onCancel}
          >
            ยกเลิก
          </button>
          <button
            className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            ยืนยัน
          </button>
        </div>
      </section>
    </div>
  );
}
