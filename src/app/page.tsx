import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  if (session?.facilityId) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-10 px-6 py-14">
        <header className="space-y-4">
          <p className="inline-flex rounded-full border border-zinc-700 px-3 py-1 text-xs uppercase tracking-[0.15em] text-zinc-300">
            LTC Manager
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white md:text-6xl">
            Run your facility operations without spreadsheets, guesswork, or back-and-forth.
          </h1>
          <p className="max-w-2xl text-base text-zinc-300 md:text-lg">
            Launch your facility workspace, add managers and locations, and get your team operating in one guided setup
            flow.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/signup"
            className="app-button rounded-md bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
          >
            Start free setup
          </Link>
          <Link
            href="/login"
            className="app-button rounded-md border border-zinc-600 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Sign in
          </Link>
        </div>

        <section className="grid gap-4 pt-2 text-sm text-zinc-200 md:grid-cols-3">
          <article className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="font-semibold text-white">Fast onboarding</h2>
            <p className="mt-2 text-zinc-300">Create your facility and admin account in minutes.</p>
          </article>
          <article className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="font-semibold text-white">Guided setup</h2>
            <p className="mt-2 text-zinc-300">Simple steps walk you through managers, locations, and billing.</p>
          </article>
          <article className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="font-semibold text-white">Ready to operate</h2>
            <p className="mt-2 text-zinc-300">Land directly in your dashboard with a clear launch checklist.</p>
          </article>
        </section>
      </div>
    </main>
  );
}
