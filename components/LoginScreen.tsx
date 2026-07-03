"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import { Field } from "@/components/ui/Field";

const supabase = createBrowserSupabase();

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-brand-700 font-bold text-white">
            RP
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">AsakanLeadFlow</h1>
          <p className="text-sm text-slate-500">Sign in to manage leads, teams, and pipelines.</p>
        </div>

        <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="current-password"
        />
        {message ? (
          <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>
        ) : null}

        <button
          className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
          disabled={busy || !email || !password}
          onClick={submit}
        >
          {busy ? "Working..." : "Sign in"}
        </button>
      </section>
    </main>
  );
}
