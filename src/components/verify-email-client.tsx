"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function VerifyEmailClient({ token }: { token: string | null }) {
  return <VerificationAttempt key={token ?? "missing"} token={token} />;
}

async function confirmEmail(token: string): Promise<{ nextPath: string } | { error: string }> {
  try {
    const response = await fetch("/api/auth/email-verification/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      return { error: payload.error ?? "This verification link is invalid or expired." };
    }
    const payload = (await response.json()) as { nextPath?: string };
    return { nextPath: payload.nextPath ?? "/setup" };
  } catch {
    return { error: "Could not verify this email. Try again." };
  }
}

function VerificationAttempt({ token }: { token: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));

  const confirmation = useRef<ReturnType<typeof confirmEmail> | null>(null);

  useEffect(() => {
    if (!token) return;
    // A single-use link has one request per keyed mount, even when React re-runs the effect.
    confirmation.current ??= confirmEmail(token);
    let cancelled = false;
    void confirmation.current.then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      router.replace(result.nextPath);
      router.refresh();
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
        {!token ? "This verification link is missing a token." : error ?? "This verification link is invalid or expired."}
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
