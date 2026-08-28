export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-slate-800">
      <h1 className="mb-2 text-2xl font-bold">Terms of Service</h1>
      <p className="mb-8 text-sm text-slate-500">Last updated: August 28, 2026</p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">1. Acceptance</h2>
        <p className="text-sm leading-relaxed">
          By using AsakanLeadFlow, you agree to these terms. This platform is intended for internal
          use by authorized staff of Asakan real estate business only.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. Use of Service</h2>
        <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
          <li>The platform is for managing customer leads and sales pipeline</li>
          <li>Users must not share credentials or access with unauthorized parties</li>
          <li>All customer data must be handled responsibly and in accordance with applicable laws</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">3. Third-Party Integrations</h2>
        <p className="text-sm leading-relaxed">
          The platform integrates with Facebook and TikTok APIs to retrieve lead data. Use of these
          integrations is subject to the respective platform&apos;s terms of service.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">4. Limitation of Liability</h2>
        <p className="text-sm leading-relaxed">
          We are not liable for any data loss or business disruption resulting from third-party API
          changes or service interruptions.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">5. Contact</h2>
        <p className="text-sm leading-relaxed">
          For any questions regarding these terms, contact:{" "}
          <a href="mailto:nnote1985@gmail.com" className="text-blue-600 underline">
            nnote1985@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
