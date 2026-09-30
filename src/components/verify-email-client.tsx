"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function VerifyEmailClient({ token }: { token: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setError("This verification link is missing a token.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/email-verification/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (cancelled) return;
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setLoading(false);
        setError(payload.error ?? "This verification link is invalid or expired.");
        return;
      }
      const payload = (await res.json()) as { nextPath?: string };
      router.replace(payload.nextPath ?? "/setup");
      router.refresh();
    })().catch(() => {
      if (!cancelled) {
        setLoading(false);
        setError("Could not verify this email. Try again.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (loading) {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Verifying email…</h1>
        <p className="text-sm text-[var(--text-secondary)]">One moment while we confirm your address.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-[var(--foreground)]">Couldn’t verify email</h1>
      <p className="text-sm text-[var(--text-secondary)]" role="alert">
        {error ?? "This verification link is invalid or expired."}
      </p>
      <Link
        href="/check-email"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
      >
        Resend verification email
      </Link>
      <Link href="/login" className="block text-center text-sm font-medium text-[var(--brand-accent)] underline">
        Back to sign in
      </Link>
    </div>
  );
}
