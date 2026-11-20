"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { staffPost, type AssertionCeremony, type EnrollmentCeremony } from "./staff-lifecycle-client";

const path = "/api/console/staff-lifecycle/identity";
const field = "w-full rounded-md border border-[var(--border)] px-3 py-2";
const button = "rounded-md bg-[var(--run-aside)] px-4 py-2 text-white disabled:opacity-50";

export function StaffAccessForm({ recoveryEnabled }: { recoveryEnabled: boolean }) {
  const [token, setToken] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const value = fragment.get("token");
    if (value && /^[a-zA-Z0-9_-]{43}$/.test(value)) {
      setToken(value); setRecovery(fragment.get("purpose") === "RECOVERY");
    }
    // Keep the bearer token only in this component's memory, never browser storage or the address bar.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function perform(run: () => Promise<void>) {
    setPending(true); setMessage("");
    try { await run(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The request could not be completed."); }
    finally { setPending(false); }
  }

  async function requestRecovery(form: FormData) {
    await perform(async () => {
      await staffPost(path, { operation: "request-recovery", email: String(form.get("email") ?? "").trim().toLowerCase() });
      setMessage("If this is an eligible staff address, recovery instructions will be sent to it.");
    });
  }

  async function proveExistingPasskey() {
    await perform(async () => {
      const ceremony = await staffPost<AssertionCeremony>(path, { operation: "begin-recovery-factor", token });
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const response = await startAuthentication({ optionsJSON: ceremony.options });
      await staffPost(path, { operation: "prove-recovery-factor", token, challengeId: ceremony.challengeId, response });
      setMessage("Passkey verified in this browser. Continue within five minutes. Sole-OWNER recovery still requires independent approval.");
    });
  }

  async function enroll(form: FormData) {
    await perform(async () => {
      const password = String(form.get("password") ?? "");
      if (password !== String(form.get("confirmPassword") ?? "")) throw new Error("The passwords must match.");
      const ceremony = await staffPost<EnrollmentCeremony>(path, { operation: "begin-enrollment", token });
      const { startRegistration } = await import("@simplewebauthn/browser");
      const response = await startRegistration({ optionsJSON: ceremony.options });
      await staffPost(path, { operation: "finish-enrollment", token, challengeId: ceremony.challengeId, response,
        password, ...(!recovery ? { displayName: String(form.get("displayName") ?? "").trim() } : {}) });
      setToken(""); setFinished(true);
      setMessage(recovery ? "Credentials replaced. Earlier staff logins have been invalidated. Sign in with your new password and passkey." :
        "Your Member account is active. Sign in with your password and passkey.");
    });
  }

  return <div className="w-full max-w-md space-y-5 rounded-xl border border-[var(--border)] bg-white p-6">
    <h1 className="text-xl font-semibold">Vssyl staff access</h1>
    <p className="text-sm">For internal Vssyl staff. Facility accounts use their own sign-in and recovery pages.</p>
    {token ? <>
      {recovery && <div className="space-y-3"><p>Use an existing passkey or ask your designated independent approver to verify your recovery request. Sole-OWNER recovery always needs that approval.</p>
        <button className={button} onClick={proveExistingPasskey} disabled={pending}>Verify an existing passkey</button></div>}
      <form action={enroll} className="space-y-3">
        {!recovery && <label className="block">Your name<input className={field} name="displayName" autoComplete="name" maxLength={100} required /></label>}
        <label className="block">New password<input className={field} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
        <label className="block">Confirm password<input className={field} name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
        <p className="text-sm">Create a passkey when your browser asks. The email link can be used only once.</p>
        <button className={button} disabled={pending}>{pending ? "Working…" : recovery ? "Replace credentials and enroll passkey" : "Activate Member account"}</button>
      </form>
    </> : !finished && recoveryEnabled ? <form action={requestRecovery} className="space-y-3">
      <h2 className="font-semibold">Recover your staff login</h2>
      <label className="block">Work email<input className={field} name="email" type="email" autoComplete="username" maxLength={200} required /></label>
      <button className={button} disabled={pending}>Request recovery instructions</button>
    </form> : !finished && <p>Open the invitation link sent to your work email. Staff recovery is not enabled.</p>}
    <p role="status" aria-live="polite">{message}</p>
    <Link prefetch={false} href="/console/login" className="underline">Staff sign in</Link>
  </div>;
}
