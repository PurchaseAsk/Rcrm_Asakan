"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Download,
  FileText,
  MapPin,
  MessageCircle,
  QrCode,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ToolItem = {
  title: string;
  subtitle: string;
  src: string;
  icon: LucideIcon;
};

const toolSections: { title: string; items: ToolItem[] }[] = [
  {
    title: "QR PromptPay",
    items: [
      { title: "กรุงศรี", subtitle: "PromptPay", src: "/sales-hub/assets/qr-krungsri.png", icon: CreditCard },
      { title: "กสิกร", subtitle: "PromptPay", src: "/sales-hub/assets/qr-kbank.png", icon: CreditCard },
    ],
  },
  {
    title: "QR LINE",
    items: [
      { title: "Official", subtitle: "LINE", src: "/sales-hub/assets/qr-line-official.png", icon: MessageCircle },
      { title: "Elysium", subtitle: "LINE", src: "/sales-hub/assets/qr-line-elysium.png", icon: MessageCircle },
      { title: "Wela", subtitle: "LINE", src: "/sales-hub/assets/qr-line-wela.png", icon: MessageCircle },
    ],
  },
  {
    title: "Maps",
    items: [
      { title: "Elysium", subtitle: "Map", src: "/sales-hub/assets/map-elysium.png", icon: MapPin },
      { title: "Wela", subtitle: "Map", src: "/sales-hub/assets/map-wela.png", icon: MapPin },
    ],
  },
  {
    title: "Pricelist",
    items: [
      { title: "Elysium", subtitle: "Pricelist", src: "/sales-hub/assets/pricelist-elysium.png", icon: FileText },
      { title: "Wela", subtitle: "Pricelist", src: "/sales-hub/assets/pricelist-wela.png", icon: FileText },
    ],
  },
  {
    title: "Company",
    items: [
      { title: "ที่อยู่บริษัท", subtitle: "Company Address", src: "/sales-hub/assets/company-address.png", icon: Building2 },
    ],
  },
];

export default function SalesHubToolsPage() {
  const [activeImage, setActiveImage] = useState<ToolItem | null>(null);

  return (
    <main className="min-h-dvh bg-white px-[18px] pb-10 text-[#14110f] sm:px-8 sm:pb-14 xl:px-14 xl:pb-[72px]">
      <div className="mx-auto max-w-[1480px]">
        <header className="mb-[18px] flex items-center justify-between gap-3 border-b border-[#ececea] px-1 py-[22px] sm:mb-7 sm:py-8">
          <Link
            href="/sales-hub"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#f1f1ef] px-3 text-[13px] font-semibold text-[#14110f] transition hover:bg-[#ffe9e0] hover:text-[#c9421f]"
          >
            <ArrowLeft size={15} />
            Hub
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 text-right">
              <h1 className="truncate text-lg font-bold leading-none sm:text-2xl">Tools / QR / Media</h1>
              <p className="mt-1 truncate text-[11.5px] text-[#8e8b85] sm:text-[13px]">ลิงก์ลัด & รูป QR</p>
            </div>
            <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-[#ee5a36] text-white shadow-[0_4px_10px_rgba(238,90,54,0.25)] sm:h-[52px] sm:w-[52px] sm:rounded-2xl">
              <QrCode size={22} />
            </span>
          </div>
        </header>

        <div className="grid gap-3 lg:grid-cols-2 lg:gap-5">
          {toolSections.map((section) => (
            <section key={section.title} className="rounded-[22px] bg-[#f1f1ef] p-3 sm:rounded-[26px] sm:p-5">
              <div className="flex items-center justify-between px-1.5 pb-3 sm:px-2 sm:pb-4">
                <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#14110f] sm:text-[13px]">{section.title}</h2>
                <span className="text-[11px] tabular-nums text-[#8e8b85] sm:text-xs">{String(section.items.length).padStart(2, "0")}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-3 md:gap-3">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={`${section.title}-${item.src}`}
                      type="button"
                      onClick={() => setActiveImage(item)}
                      className="group flex min-h-[110px] flex-col justify-between rounded-2xl border border-[#ececea] bg-white p-3.5 text-left transition hover:-translate-y-0.5 hover:border-[#ffe9e0] hover:shadow-[0_8px_20px_rgba(20,17,15,0.05)] sm:min-h-[120px] sm:rounded-[18px] sm:p-4"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#f1f1ef] text-[#14110f] transition group-hover:bg-[#ffe9e0] group-hover:text-[#c9421f]">
                        <Icon size={18} />
                      </span>
                      <span>
                        <span className="line-clamp-2 block text-[13.5px] font-semibold leading-tight text-[#ee5a36] sm:text-sm">{item.title}</span>
                        <span className="mt-1 block text-[11.5px] leading-tight text-[#8e8b85] sm:text-xs">{item.subtitle}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {activeImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3" role="dialog" aria-modal="true">
          <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-[22px] bg-white shadow-2xl">
            <div className="flex h-12 items-center justify-between gap-3 border-b border-[#ececea] px-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#14110f]">{activeImage.title}</p>
                <p className="truncate text-xs text-[#8e8b85]">{activeImage.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveImage(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#f1f1ef] text-[#8e8b85] transition hover:bg-[#ffe9e0] hover:text-[#c9421f]"
                aria-label="Close preview"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[#f1f1ef] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeImage.src} alt={activeImage.title} className="mx-auto max-h-[72dvh] w-auto max-w-full rounded-[14px] bg-white shadow-sm" />
            </div>
            <div className="border-t border-[#ececea] p-3">
              <a
                href={activeImage.src}
                download
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[#ee5a36] px-4 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(238,90,54,0.25)] transition hover:bg-[#c9421f] sm:w-auto"
              >
                <Download size={16} />
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
