"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ManagerInviteAcceptForm({ token, email, facilityName, mode }: { token: string; email: string; facilityName: string; mode: "new" | "signed_in" | "login" | "wrong_user" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function accept(form: FormData) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/auth/account-invite/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "manager", token, firstName: form.get("firstName"), lastName: form.get("lastName"), employmentType: form.get("employmentType"), ...(mode === "new" ? { password: form.get("password"), confirmPassword: form.get("confirmPassword") } : {}) }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.nextPath) throw new Error(result.error ?? "Could not accept this invitation. Sign in to check your access before retrying.");
      router.replace(result.nextPath); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Invitation could not be accepted. Check your access before retrying."); setBusy(false); }
  }
  return <div className="w-full max-w-md space-y-4 rounded border bg-white p-6">
    <h1 className="text-xl font-semibold">Join {facilityName} as a Manager</h1><p className="text-sm">Invitation for {email}. Accepting adds Facility Manager access and your staff record. Department responsibilities remain separate.</p>
    {mode === "login" || mode === "wrong_user" ? <><p role="alert">{mode === "wrong_user" ? "This invitation belongs to another account. Sign out, then sign in with the invited email." : "Sign in with the invited email, then reopen this invitation link."}</p>{mode === "wrong_user" ? <form method="post" action="/api/auth/logout"><button className="app-button">Sign out</button></form> : <Link className="underline" href="/login">Sign in</Link>}</> : <form onSubmit={(event) => { event.preventDefault(); void accept(new FormData(event.currentTarget)); }} className="space-y-3">
      <label className="block">First name<input required maxLength={100} name="firstName" className="app-input w-full" autoComplete="given-name" /></label>
      <label className="block">Last name<input required maxLength={100} name="lastName" className="app-input w-full" autoComplete="family-name" /></label>
      <label className="block">Work arrangement<select required name="employmentType" defaultValue="" className="app-input w-full"><option value="" disabled>Choose your work arrangement</option><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="PER_DIEM">Per diem</option></select></label>
      {mode === "new" ? <><label className="block">Password<input required minLength={10} maxLength={128} name="password" type="password" autoComplete="new-password" className="app-input w-full" /></label><label className="block">Confirm password<input required minLength={10} maxLength={128} name="confirmPassword" type="password" autoComplete="new-password" className="app-input w-full" /></label></> : null}
      {error ? <p role="alert">{error}</p> : null}<button disabled={busy} className="app-button app-accent-button text-white">{busy ? "Accepting…" : "Accept Manager invitation"}</button>
    </form>}
  </div>;
}
