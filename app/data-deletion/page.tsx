import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Deletion Instructions | AsakanLeadFlow",
  description: "Instructions for requesting deletion of personal data processed by AsakanLeadFlow.",
};

const updatedAt = "June 25, 2026";
const contactEmail = "nnote11122@gmail.com";

export default function DataDeletionPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-6 py-12 text-slate-800">
      <div className="mb-8">
        <Link href="/" className="text-sm font-medium text-brand-700 underline underline-offset-4">
          Back to AsakanLeadFlow
        </Link>
      </div>

      <header className="mb-10 border-b border-slate-200 pb-6">
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">AsakanLeadFlow</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Data Deletion Instructions</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: {updatedAt}</p>
      </header>

      <div className="space-y-8 text-base leading-7">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">How to request deletion</h2>
          <p>
            To request deletion of personal data processed by AsakanLeadFlow, email us at{" "}
            <a href={`mailto:${contactEmail}`} className="font-medium text-brand-700 underline underline-offset-4">
              {contactEmail}
            </a>
            . Please include enough information for us to identify the record, such as your name, phone
            number, email address, Facebook Page conversation context, or the business project you contacted.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">Data we can delete</h2>
          <p>Depending on what exists in the CRM, deletion may include:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Lead records received from Facebook Lead Ads or website forms.</li>
            <li>Contact information such as name, phone number, and email address.</li>
            <li>Facebook Page conversation records, Page-scoped user IDs, and message history.</li>
            <li>Lead activities, tags, assignments, reminders, and CRM notes linked to the request.</li>
            <li>Ad attribution metadata linked to a lead or conversation, when present.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">Processing time</h2>
          <p>
            We will review and process valid deletion requests within 30 days, unless a longer period is
            required by law, security review, fraud prevention, dispute handling, or legitimate business
            record obligations.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">Data that may be retained</h2>
          <p>
            Some limited information may be retained when required for legal compliance, security logs,
            abuse prevention, accounting, dispute resolution, or to prove that a deletion request was
            completed. Retained data will be limited to what is necessary for those purposes.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">Facebook app data</h2>
          <p>
            If you interacted with a Facebook Page connected to AsakanLeadFlow, we may receive data through
            Meta platform permissions such as lead retrieval and Page messaging. You can request deletion
            of that CRM data using the email above. You can also manage Facebook app and Page permissions
            from your Facebook account settings.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-950">Related documents</h2>
          <p>
            You can also review our{" "}
            <Link href="/privacy-policy" className="font-medium text-brand-700 underline underline-offset-4">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="font-medium text-brand-700 underline underline-offset-4">
              Terms of Service
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
