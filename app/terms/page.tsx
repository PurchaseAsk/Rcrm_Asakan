import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | AsakanLeadFlow",
  description: "Terms of Service for AsakanLeadFlow CRM.",
};

const updatedAt = "June 25, 2026";
const contactEmail = "nnote11122@gmail.com";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-6 py-12 text-slate-800">
      <div className="mb-8">
        <Link href="/" className="text-sm font-medium text-brand-700 underline underline-offset-4">
          Back to AsakanLeadFlow
        </Link>
      </div>

      <header className="mb-10 border-b border-slate-200 pb-6">
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">AsakanLeadFlow</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Terms of Service</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: {updatedAt}</p>
      </header>

      <div className="space-y-8 text-base leading-7">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">1. Service overview</h2>
          <p>
            AsakanLeadFlow is a customer relationship management system used to receive, organize, assign,
            and follow up with leads and conversations from connected business channels, including Facebook
            Lead Ads and Facebook Page Messenger.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">2. Authorized use</h2>
          <p>
            Users may use the service only for legitimate business purposes, including lead management,
            customer communication, team assignment, reminder workflows, and internal reporting. Users must
            not use the service to send unlawful, misleading, abusive, or unauthorized messages.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">3. Platform data</h2>
          <p>
            When a Facebook Page is connected, the service may process Page-related platform data such as
            lead form submissions, Page-scoped user IDs, conversation messages, message metadata, ad
            attribution identifiers, and Page access configuration needed to operate the CRM. This data is
            used only to provide CRM, inbox, lead distribution, attribution, and support functionality.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">4. User responsibilities</h2>
          <p>
            Users are responsible for ensuring that they have the right to connect each Facebook Page,
            access customer data, contact leads, and assign CRM users to view or manage that data. Users
            must keep access credentials confidential and promptly remove access for staff who no longer
            need it.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">5. Data retention and deletion</h2>
          <p>
            CRM records are retained while they are needed for business follow-up, customer support, legal
            compliance, security, or operational purposes. Users or data subjects may request deletion of
            personal data through our data deletion page.
          </p>
          <p className="mt-3">
            Data deletion instructions are available at{" "}
            <Link href="/data-deletion" className="font-medium text-brand-700 underline underline-offset-4">
              /data-deletion
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">6. Changes to these terms</h2>
          <p>
            We may update these terms when the service, legal requirements, or platform requirements change.
            The updated date on this page will reflect the latest version.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">7. Contact</h2>
          <p>
            For questions about these terms, contact us at{" "}
            <a href={`mailto:${contactEmail}`} className="font-medium text-brand-700 underline underline-offset-4">
              {contactEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
