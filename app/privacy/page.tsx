export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-slate-800">
      <h1 className="mb-2 text-2xl font-bold">Privacy Policy</h1>
      <p className="mb-8 text-sm text-slate-500">Last updated: August 28, 2026</p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">1. Overview</h2>
        <p className="text-sm leading-relaxed">
          AsakanLeadFlow (&quot;we&quot;, &quot;our&quot;, &quot;the app&quot;) is a CRM platform used internally by Asakan real
          estate business to manage leads from advertising campaigns on Facebook and TikTok. This
          policy explains how we collect, use, and protect data.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. Data We Collect</h2>
        <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
          <li>Lead information submitted through Facebook Lead Ads and TikTok Lead Generation forms (name, phone number, email)</li>
          <li>Facebook Page and TikTok advertiser account data used to retrieve leads</li>
          <li>Messenger and comment interaction data for customer communication</li>
          <li>Internal staff account information (name, email, role)</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">3. How We Use Data</h2>
        <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
          <li>To manage and follow up with prospective customers (leads)</li>
          <li>To assign leads to sales staff and track sales pipeline progress</li>
          <li>To respond to customer inquiries via Messenger and Facebook comments</li>
          <li>Data is used solely for internal CRM operations and is not sold or shared with third parties</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">4. Data Storage</h2>
        <p className="text-sm leading-relaxed">
          All data is stored securely in Supabase (PostgreSQL) with row-level security policies.
          Access is restricted to authorized staff only.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">5. Data Retention</h2>
        <p className="text-sm leading-relaxed">
          Lead data is retained for as long as necessary to fulfill business purposes. Users may
          request deletion of their data by contacting us.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">6. Contact</h2>
        <p className="text-sm leading-relaxed">
          For any privacy-related inquiries, please contact:{" "}
          <a href="mailto:nnote1985@gmail.com" className="text-blue-600 underline">
            nnote1985@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
