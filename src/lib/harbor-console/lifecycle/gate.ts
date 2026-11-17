import { evaluateDatabaseTarget } from "@/lib/verify/database-target";

const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
export const STAFF_MFA_COOKIE = "harbor_mfa_pending";
export const STAFF_MFA_PATH = "/api/console/staff-lifecycle/identity";

export function staffLifecycleRequested() {
  return process.env.HARBOR_STAFF_LIFECYCLE_MODE === "synthetic" && !process.env.VERCEL;
}

/** This review slice can only use synthetic accounts on a disposable loopback database. */
export function staffLifecycleConfig(request: Request) {
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
  const ids = (value: string | undefined) => new Set((value ?? "").split(",").map((id) => id.trim()).filter(Boolean));
  return {
    origin, rpID, mailbox,
    rosterApprovers: ids(process.env.HARBOR_STAFF_LIFECYCLE_ROSTER_APPROVER_IDS),
    administrators: ids(process.env.HARBOR_STAFF_LIFECYCLE_ADMIN_IDS),
    recoveryApprovers: ids(process.env.HARBOR_STAFF_LIFECYCLE_RECOVERY_APPROVER_IDS),
  };
}

export type StaffLifecycleConfig = NonNullable<ReturnType<typeof staffLifecycleConfig>>;
