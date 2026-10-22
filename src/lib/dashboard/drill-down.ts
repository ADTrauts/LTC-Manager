import { isPartnerFacilitySession } from "@/lib/auth";
import { authorizeRoute } from "@/lib/route-registry/authorize";

import type { DashboardViewer } from "./viewer/types";

/** The Dashboard never renders a link the viewer cannot open. Query and hash do not change the route. */
export function isDashboardHrefAuthorized(
  viewer: Pick<DashboardViewer, "role" | "session" | "routeFlags">,
  href: string,
): boolean {
  const pathname = href.split(/[?#]/, 1)[0] ?? "";
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
