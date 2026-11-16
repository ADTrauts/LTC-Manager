import { evaluateDatabaseTarget } from "@/lib/verify/database-target";

const hostedPilotApproved = false;
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const ASSISTANCE_VIEW = "/console/assistance";
export const ASSISTANCE_COMMANDS = "/api/console/assistance";
export const ASSISTANCE_CONSENT = "/api/harbor-assistance/consent";

export function isAssistancePath(path: string) {
  return path === ASSISTANCE_VIEW || path === ASSISTANCE_COMMANDS || path === ASSISTANCE_CONSENT;
}

function values(input: string | undefined) {
  return new Set((input ?? "").split(",").map((value) => value.trim()).filter(Boolean));
}
function hostName(host: string | null, scheme = "http") {
  try {
    if (!host || /[\s,\/@?#]/.test(host)) return null;
    const url = new URL(`${scheme}://${host}`);
    return url.hostname;
  } catch {
    return null;
  }
}

export function getAssistancePilot(host: string | null, env: NodeJS.ProcessEnv = process.env) {
  const name = hostName(host);
  if (!name) return null;
  const hosted = Boolean(env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL || env.CI);
  if (hosted) {
    // Future release must separately verify Vercel Authentication for the exact allowlisted deployment.
    if (!hostedPilotApproved || env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
        name !== env.VERCEL_URL || !values(env.HARBOR_ASSISTANCE_PROTECTED_PREVIEWS).has(name)) return null;
  } else {
    const db = evaluateDatabaseTarget(env.DATABASE_URL);
    if (env.HARBOR_ASSISTANCE_LOCAL !== "1" || !loopback.has(name) || !db.ok || !loopback.has(db.host)) return null;
  }

  const facilities = values(env.HARBOR_ASSISTANCE_FACILITIES);
  const staff = values(env.HARBOR_ASSISTANCE_STAFF);
  const viewers = values(env.HARBOR_ASSISTANCE_VIEWERS);
  const approvers = values(env.HARBOR_ASSISTANCE_APPROVERS);
  const revokers = values(env.HARBOR_ASSISTANCE_REVOKERS);
  const reviewers = values(env.HARBOR_ASSISTANCE_REVIEWERS);
  if (!facilities.size || !staff.size || !viewers.size) return null;
  if ([viewers, approvers, revokers, reviewers].some((set) => [...set].some((id) => !staff.has(id)))) return null;
  if ([...reviewers].some((id) => approvers.has(id))) return null;
  return { facilities, staff, viewers, approvers, revokers, reviewers };
}

export type AssistancePilot = NonNullable<ReturnType<typeof getAssistancePilot>>;
export const assistanceNoStore = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };

export function acceptsAssistanceDocument(headers: Headers) {
  return !headers.has("next-router-prefetch") && !headers.has("next-router-segment-prefetch") &&
    !headers.has("rsc") && ![headers.get("purpose"), headers.get("sec-purpose")].some((v) => v?.includes("prefetch"));
}
