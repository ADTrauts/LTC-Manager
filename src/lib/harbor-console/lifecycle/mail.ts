import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { lifecycleEmailAllowed, type StaffLifecycleConfig } from "./gate";

export type StaffLifecycleMail =
  | { kind: "INVITE" | "RECOVERY"; to: string; token: string; intentId: string }
  | { kind: "RECOVERY_COMPLETED"; to: string; intentId: string };

export async function deliverStaffLifecycleMail(config: StaffLifecycleConfig, mail: StaffLifecycleMail) {
  if (config.mode !== "production") {
    const response = await fetch(config.mailbox, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { "content-type": "application/json" }, body: JSON.stringify(mail), cache: "no-store",
    });
    if (!response.ok) throw new Error("Staff email delivery unavailable.");
    return;
  }
  if (!lifecycleEmailAllowed(config, mail.to) ||
      (mail.kind === "INVITE" ? !config.invitationsEnabled : !config.recoveryEnabled)) {
    throw new Error("Staff email delivery is disabled.");
  }
  const completed = mail.kind === "RECOVERY_COMPLETED";
  const url = new URL("/console/staff-access", config.origin);
  // Fragment tokens never enter request URLs, access logs, referrers or server-rendered HTML.
  if ("token" in mail) url.hash = new URLSearchParams({ token: mail.token, purpose: mail.kind }).toString();
  const result = await sendTransactionalEmail({
    to: mail.to,
    subject: completed ? "Your Vssyl Console credentials changed" :
      mail.kind === "INVITE" ? "Your Vssyl staff invitation" : "Your Vssyl staff recovery request",
    text: completed ?
      "Your Vssyl Console credentials have been replaced and earlier staff logins have been invalidated. If you did not request this, contact your designated recovery approver immediately." :
      [mail.kind === "INVITE" ?
        "You have been invited to join Vssyl Console as a Member. Verify this mailbox and create a password and passkey to activate." :
        "You requested Vssyl Console credential recovery. An existing passkey or independent approval is required. Sole-owner recovery always requires independent approval.",
      mail.kind === "INVITE" ? "This one-use link expires in 24 hours." : "This one-use link expires in 30 minutes.",
      url.toString(), "If you did not expect this message, ignore it."].join("\n\n"),
    tag: completed ? "harbor-recovery-notice" : mail.kind === "INVITE" ? "harbor-staff-invite" : "harbor-staff-recovery",
  });
  // Never surface provider error text: it may contain addresses or credential-bearing message data.
  if (!result.sent) throw new Error("Staff email delivery unavailable.");
}
