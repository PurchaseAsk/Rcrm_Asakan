"use client";

import { useState } from "react";
import { MessageSquareText, X } from "lucide-react";

export function StageChangeNoteModal({
  stageName,
  onCancel,
  onConfirm,
}: {
  stageName: string;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const trimmed = note.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-note-title"
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <MessageSquareText size={18} />
            </div>
            <div className="min-w-0">
              <h2 id="stage-note-title" className="font-semibold text-slate-950">
                Stage change note
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Moving this lead to <span className="font-medium text-slate-700">{stageName}</span>
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

        <div className="p-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Required note</span>
            <textarea
              autoFocus
              className="mt-1 min-h-28 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="เช่น โทรติดต่อลูกค้าแล้ว / นัดเข้าชมวันที่ 16/6/2569"
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">ระบบจะบันทึกข้อความนี้ลง Activity ของลีด</p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
          >
            Confirm move
          </button>
        </div>
      </section>
    </div>
  );
}
