import { isPartnerFacilitySession } from "@/lib/auth";
import { authorizeRoute } from "@/lib/route-registry/authorize";

import type { DashboardViewer } from "./viewer/types";

/** Facility destinations that already have a partner page. Unmapped links stay hidden. */
const PARTNER_DASHBOARD_PREFIXES = [
  ["/staffing/log-book", "/partner/logs"],
  ["/reports", "/partner/reports"],
  ["/units", "/partner/locations"],
  ["/assets", "/partner/assets"],
  ["/logs", "/partner/logs"],
  ["/employees", "/partner/people"],
  ["/dashboard", "/partner"],
] as const;

/** Partner sessions open the partner page for the same destination. Facility sessions keep the original link. */
export function dashboardHrefForViewer(
  viewer: Pick<DashboardViewer, "session">,
  href: string,
): string {
  if (!isPartnerFacilitySession(viewer.session)) return href;
  const hashAt = href.indexOf("#");
  const withoutHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const queryAt = withoutHash.indexOf("?");
  const path = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
  const query = queryAt >= 0 ? withoutHash.slice(queryAt) : "";
  for (const [from, to] of PARTNER_DASHBOARD_PREFIXES) {
    if (path === from || path.startsWith(`${from}/`)) {
      return `${to}${path.slice(from.length)}${query}${hash}`;
    }
  }
  return href;
}

/** The Dashboard never renders a link the viewer cannot open. Query and hash do not change the route. */
export function isDashboardHrefAuthorized(
  viewer: Pick<DashboardViewer, "role" | "session" | "routeFlags">,
  href: string,
): boolean {
  const pathname = dashboardHrefForViewer(viewer, href).split(/[?#]/, 1)[0] ?? "";
  if (!pathname.startsWith("/")) return false;
  const partner = isPartnerFacilitySession(viewer.session);
  return (
    authorizeRoute({
      pathname,
      role: partner ? null : viewer.role,
      sessionScope: partner ? "partner" : "facility",
      authKind: viewer.session.authKind,
      featureFlags: viewer.routeFlags,
    }).outcome === "ALLOW"
  );
}
