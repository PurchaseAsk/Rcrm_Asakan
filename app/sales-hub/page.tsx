"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  FileSignature,
  Gift,
  Globe,
  LineChart,
  QrCode,
  Sparkles,
  Ticket,
  UserRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type HubLink = {
  title: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  isInternal?: boolean;
};

const hubSections: { title: string; items: HubLink[] }[] = [
  {
    title: "Routine",
    items: [
      { title: "สัญญา / ติดตามงวดดาวน์", subtitle: "ContractFlow", href: "https://contractely.pages.dev", icon: FileSignature },
      { title: "ควบคุมของแถม", subtitle: "Premium Control", href: "https://asakanpremium.pages.dev/", icon: Gift },
      { title: "Leadflow", subtitle: "Webapp", href: "/", icon: Activity, isInternal: true },
    ],
  },
  {
    title: "Sales",
    items: [
      { title: "Sales-kit Elysium", subtitle: "Elysium", href: "https://elymatrix.netlify.app/", icon: Ticket },
      { title: "Sales-kit Wela", subtitle: "Wela", href: "https://saleskitwela.pages.dev/", icon: Ticket },
      { title: "Lead Website", subtitle: "Elysium", href: "https://docs.google.com/spreadsheets/d/1rIV8z4XAizTavRwGEmpIK_LNb6OS-WvLHKsufzUueyc/", icon: Globe },
      { title: "Lead Website", subtitle: "Wela", href: "https://docs.google.com/spreadsheets/d/1-ljsdgFKdztFPuFeo-_BFUSy0ZJanTs6CMp9_JPknqY", icon: Globe },
    ],
  },
  {
    title: "Asakan Member",
    items: [
      { title: "ลงทะเบียน Gift Card", subtitle: "Register Gift Card", href: "https://centralcard.vercel.app/", icon: Sparkles },
      { title: "Asakan CRM", subtitle: "Member Management", href: "https://asakancrm.pages.dev", icon: UserRound },
      { title: "Assetcare", subtitle: "Asset Management", href: "https://asakanassetcare.pages.dev/", icon: Wrench },
    ],
  },
  {
    title: "KPI",
    items: [
      { title: "KPI", subtitle: "Sale Dashboard", href: "https://dashboard-sable-beta-81.vercel.app", icon: LineChart },
    ],
  },
];

export default function SalesHubPage() {
  return (
    <main className="min-h-dvh bg-white px-[18px] pb-10 text-[#14110f] sm:px-8 sm:pb-14 xl:px-14 xl:pb-[72px]">
      <div className="mx-auto max-w-[1480px]">
        <header className="mb-[18px] flex items-center justify-between gap-3 border-b border-[#ececea] px-1 py-[22px] sm:mb-7 sm:py-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-[#ee5a36] text-lg font-bold text-white shadow-[0_4px_10px_rgba(238,90,54,0.25)] sm:h-[52px] sm:w-[52px] sm:rounded-2xl sm:text-[22px]">
              A
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-none sm:text-2xl">Sales Hub</h1>
              <p className="mt-1 truncate text-[11.5px] text-[#8e8b85] sm:text-[13px]">Asakan Member & Sales Tools</p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#f1f1ef] px-3 text-[13px] font-semibold text-[#14110f] transition hover:bg-[#ffe9e0] hover:text-[#c9421f]"
          >
            <ArrowLeft size={15} />
            CRM
          </Link>
        </header>

        <div className="grid gap-3 lg:grid-cols-2 lg:gap-5">
          {hubSections.map((section) => (
            <section key={section.title} className="rounded-[22px] bg-[#f1f1ef] p-3 sm:rounded-[26px] sm:p-5">
              <div className="flex items-center justify-between px-1.5 pb-3 sm:px-2 sm:pb-4">
                <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#14110f] sm:text-[13px]">{section.title}</h2>
                <span className="text-[11px] tabular-nums text-[#8e8b85] sm:text-xs">
                  {String(section.items.length + (section.title === "Routine" ? 1 : 0)).padStart(2, "0")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-3 md:gap-3">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const cardClass = "group flex min-h-[110px] flex-col justify-between rounded-2xl border border-[#ececea] bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-[#ffe9e0] hover:shadow-[0_8px_20px_rgba(20,17,15,0.05)] sm:min-h-[120px] sm:rounded-[18px] sm:p-4";
                  const cardContent = (
                    <>
                      <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#f1f1ef] text-[#14110f] transition group-hover:bg-[#ffe9e0] group-hover:text-[#c9421f]">
                        <Icon size={18} />
                      </span>
                      <span>
                        <span className="line-clamp-2 block text-[13.5px] font-semibold leading-tight text-[#ee5a36] sm:text-sm">{item.title}</span>
                        <span className="mt-1 flex items-center gap-1 text-[11.5px] leading-tight text-[#8e8b85] sm:text-xs">
                          {item.subtitle}
                          {!item.isInternal && <ExternalLink size={12} />}
                        </span>
                      </span>
                    </>
                  );
                  return item.isInternal ? (
                    <Link key={`${section.title}-${item.title}-${item.subtitle}`} href={item.href} className={cardClass}>
                      {cardContent}
                    </Link>
                  ) : (
                    <a key={`${section.title}-${item.title}-${item.subtitle}`} href={item.href} target="_blank" rel="noreferrer" className={cardClass}>
                      {cardContent}
                    </a>
                  );
                })}

                {section.title === "Routine" && (
                  <Link
                    href="/sales-hub/tools"
                    className="group col-span-2 flex min-h-16 items-center gap-3 rounded-2xl border border-[#ececea] bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-[#ffe9e0] hover:shadow-[0_8px_20px_rgba(20,17,15,0.05)] md:min-h-[120px] md:rounded-[18px]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#f1f1ef] text-[#14110f] transition group-hover:bg-[#ffe9e0] group-hover:text-[#c9421f]">
                      <QrCode size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold leading-tight text-[#ee5a36] sm:text-sm">Tools / QR</span>
                      <span className="mt-1 block truncate text-[11.5px] leading-tight text-[#8e8b85] sm:text-xs">ลิงก์ลัด & รูป QR</span>
                    </span>
                    <ChevronRight className="shrink-0 text-[#8e8b85]" size={18} />
                  </Link>
                )}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-4 text-center text-[11px] text-[#8e8b85]">© Asakan Sales Tools</footer>
      </div>
    </main>
  );
}
