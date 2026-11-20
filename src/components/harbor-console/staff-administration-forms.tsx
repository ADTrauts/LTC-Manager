"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runStaffCommand, staffPost, type EnrollmentCeremony } from "./staff-lifecycle-client";

const field = "w-full rounded-md border border-[var(--border)] px-3 py-2";
const button = "rounded-md bg-[var(--run-aside)] px-4 py-2 text-white disabled:opacity-50";

export function OwnerPasskeyEnrollment() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function enroll(form: FormData) {
    setPending(true); setMessage("");
    try {
      const path = "/api/console/staff-lifecycle/enrollment";
      const password = String(form.get("password") ?? "");
      const ceremony = await staffPost<EnrollmentCeremony>(path, { operation: "begin", password });
      const { startRegistration } = await import("@simplewebauthn/browser");
      const response = await startRegistration({ optionsJSON: ceremony.options });
      await staffPost(path, { operation: "finish", password, challengeId: ceremony.challengeId, response });
      window.location.assign("/console/login");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey enrollment could not be completed.");
    } finally { setPending(false); }
  }
  return <form action={enroll} className="max-w-md space-y-3">
    <h2 className="font-semibold">Protect your OWNER login</h2>
    <p className="text-sm">Confirm your current password and create your first passkey. You will then sign in again using both.</p>
    <label className="block">Current password<input className={field} name="password" type="password" autoComplete="current-password" required maxLength={128} /></label>
    <button className={button} disabled={pending}>{pending ? "Enrolling…" : "Create my passkey"}</button>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}

export function StaffInvitationForm({ canApproveRoster, canInvite }: { canApproveRoster: boolean; canInvite: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(form: FormData) {
    setPending(true); setMessage("");
    try {
      const action = String(form.get("command") ?? "");
      await runStaffCommand({ action, email: String(form.get("email") ?? "").trim().toLowerCase() });
      setMessage(action === "approve-roster" ? "Staff address approved. You can now send the invitation." : "Member invitation sent. It expires in 24 hours.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The request could not be completed."); }
    finally { setPending(false); }
  }
  return <form action={submit} className="max-w-md space-y-3">
    <h2 className="font-semibold">Invite Vssyl staff</h2>
    <p className="text-sm">For internal Vssyl staff only. Approve an eligible address first, then send a Member invitation. Each action requires your passkey.</p>
    <label className="block">Work email<input className={field} name="email" type="email" autoComplete="off" maxLength={200} required /></label>
    <div className="flex gap-3">
      {canApproveRoster && <button className={button} name="command" value="approve-roster" disabled={pending}>Approve address</button>}
      {canInvite && <button className={button} name="command" value="invite" disabled={pending}>Send invitation</button>}
    </div>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}

export function StaffRecoveryApproval({ intentId }: { intentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(form: FormData) {
    setPending(true); setMessage("");
    try {
      await runStaffCommand({ action: "approve-recovery", intentId, proofReference: String(form.get("reference") ?? "") });
      setMessage("Independent approval recorded. The requester can continue using their email link."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Approval could not be completed."); }
    finally { setPending(false); }
  }
  return <form action={submit} className="mt-3 max-w-md space-y-3">
    <label className="block">Identity evidence case reference<input className={field} name="reference" placeholder="CASE-2026-001" pattern="CASE-[A-Z0-9-]{1,50}" maxLength={55} required /></label>
    <label className="flex gap-2"><input type="checkbox" required />I verified the requester using the approved recovery procedure.</label>
    <button className={button} disabled={pending}>Approve with my passkey</button>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
