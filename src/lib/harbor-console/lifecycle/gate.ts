import { evaluateDatabaseTarget } from "@/lib/verify/database-target";
import { isEmailConfigured } from "@/lib/email/config";

const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
export const STAFF_MFA_COOKIE = "harbor_mfa_pending";
export const STAFF_MFA_PATH = "/api/console/staff-lifecycle/identity";

export function staffLifecycleRequested() {
  return process.env.HARBOR_STAFF_LIFECYCLE_MODE === "synthetic" && !process.env.VERCEL;
}

export type StaffLifecycleConfig = {
  origin: string;
  rpID: string;
  mailbox: string;
  rosterApprovers: Set<string>;
  administrators: Set<string>;
  recoveryApprovers: Set<string>;
  mode?: "synthetic" | "production";
  allowedEmails?: Set<string>;
  invitationsEnabled?: boolean;
  recoveryEnabled?: boolean;
  recoveryProofPolicy?: string;
};

const ids = (value: string | undefined) => new Set((value ?? "").split(",").map((id) => id.trim()).filter(Boolean));

/** Only the canonical Production origin may use real delivery. Previews never inherit this mode. */
export function productionStaffLifecycleConfig(): StaffLifecycleConfig | null {
  if (process.env.HARBOR_STAFF_LIFECYCLE_MODE !== "production" ||
      process.env.VERCEL_ENV !== "production" || !process.env.VERCEL ||
      process.env.HARBOR_STAFF_LIFECYCLE_ORIGIN !== "https://vssyl.com") return null;
  const rosterApprovers = ids(process.env.HARBOR_STAFF_LIFECYCLE_ROSTER_APPROVER_IDS);
  const administrators = ids(process.env.HARBOR_STAFF_LIFECYCLE_ADMIN_IDS);
  if (!rosterApprovers.size || !administrators.size) return null;
  const allowedEmails = new Set([...ids(process.env.HARBOR_STAFF_LIFECYCLE_ALLOWED_EMAILS)]
    .map((email) => email.toLowerCase()));
  // No wildcard/domain inference. Every invited address needs an explicit configuration entry AND roster approval.
  if ([...allowedEmails].some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)) return null;
  const recoveryApprovers = ids(process.env.HARBOR_STAFF_LIFECYCLE_RECOVERY_APPROVER_IDS);
  const recoveryProofPolicy = process.env.HARBOR_STAFF_LIFECYCLE_RECOVERY_PROOF_POLICY?.trim();
  return {
    origin: "https://vssyl.com", rpID: "vssyl.com", mailbox: "", mode: "production",
    rosterApprovers, administrators, recoveryApprovers, allowedEmails, recoveryProofPolicy,
    invitationsEnabled: process.env.HARBOR_STAFF_INVITATIONS_ENABLED === "true" && allowedEmails.size > 0 && isEmailConfigured(),
    recoveryEnabled: process.env.HARBOR_STAFF_RECOVERY_ENABLED === "true" && recoveryApprovers.size > 0 &&
      Boolean(recoveryProofPolicy) && isEmailConfigured(),
  };
}

export function lifecycleEmailAllowed(config: StaffLifecycleConfig, email: string) {
  return config.mode === "production" ? config.allowedEmails?.has(email) === true : email.endsWith("@staff.example.invalid");
}

/** Production uses exact same-origin POSTs; synthetic operation retains its disposable-loopback boundary. */
export function staffLifecycleConfig(request: Request): StaffLifecycleConfig | null {
  const production = productionStaffLifecycleConfig();
  if (production) {
    return request.headers.get("origin") === production.origin &&
      request.headers.get("host") === production.rpID ? production : null;
  }
  if (!staffLifecycleRequested()) return null;
  const db = evaluateDatabaseTarget(process.env.DATABASE_URL);
  const direct = evaluateDatabaseTarget(process.env.DIRECT_URL);
  if (!db.ok || !direct.ok || db.databaseName !== direct.databaseName ||
      !loopback.has(db.host) || !loopback.has(direct.host)) return null;
  const origin = process.env.HARBOR_STAFF_LIFECYCLE_ORIGIN;
  if (!origin || request.headers.get("origin") !== origin) return null;
  let expected: URL;
  try { expected = new URL(origin); } catch { return null; }
  const rpID = expected.hostname;
  // Next may construct request.url with its internal hostname. Only the exact configured
  // loopback origin and the Host header accepted by that origin can enable the ceremony.
  const actual = new URL(request.url);
  if (rpID !== "localhost" || expected.origin !== origin || actual.protocol !== expected.protocol ||
      (request.headers.get("host") ?? actual.host) !== expected.host) return null;
  const mailbox = process.env.HARBOR_STAFF_LIFECYCLE_MAILBOX_URL;
  if (!mailbox) return null;
  try {
    const sink = new URL(mailbox);
    if (sink.protocol !== "http:" || !loopback.has(sink.hostname) ||
        sink.username || sink.password || sink.search || sink.hash) return null;
  } catch {
    return null;
  }
  return {
    origin, rpID, mailbox,
    rosterApprovers: ids(process.env.HARBOR_STAFF_LIFECYCLE_ROSTER_APPROVER_IDS),
    administrators: ids(process.env.HARBOR_STAFF_LIFECYCLE_ADMIN_IDS),
    recoveryApprovers: ids(process.env.HARBOR_STAFF_LIFECYCLE_RECOVERY_APPROVER_IDS),
  };
}
