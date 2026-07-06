"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { UnfollowReason } from "@/types/crm";

export function UnfollowReasonModal({
  leadName,
  reasons,
  onConfirm,
  onCancel,
}: {
  leadName: string;
  reasons: UnfollowReason[];
  onConfirm: (reasonId: string | null) => void;
  onCancel: () => void;
}) {
  const activeReasons = reasons.filter((r) => r.is_active);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-xs text-slate-400">เลิกติดตาม</p>
            <p className="max-w-[240px] truncate font-medium text-slate-900">{leadName}</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {activeReasons.length > 0 ? (
            <>
              <p className="mb-3 text-sm text-slate-500">เลือกเหตุผลที่เลิกติดตาม</p>
              <div className="space-y-2">
                {activeReasons.map((r) => (
                  <label
                    key={r.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                      selectedId === r.id
                        ? "border-rose-300 bg-rose-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="unfollow_reason"
                      value={r.id}
                      checked={selectedId === r.id}
                      onChange={() => setSelectedId(r.id)}
                      className="accent-rose-500"
                    />
                    <span className="text-sm font-medium text-slate-800">{r.name}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">
              ยังไม่มีเหตุผลที่ตั้งค่าไว้ — สามารถเลิกติดตามได้เลย
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
          <button
            onClick={onCancel}
            className="h-10 flex-1 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => onConfirm(selectedId)}
            className="h-10 flex-1 rounded-xl bg-rose-500 text-sm font-semibold text-white hover:bg-rose-600"
          >
            ยืนยันเลิกติดตาม
          </button>
        </div>
      </div>
    </div>
  );
}
