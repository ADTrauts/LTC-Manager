import { NextResponse } from "next/server";
import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";

/** Retired after ONB-03 migrated setup callers to canonical Facility Builder intake.
 * Historical locations remain intact. This route performs no mutation.
 */
export async function POST() {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");
  return NextResponse.json({ error: "Use Facility Builder to add or import locations, then return to the setup workspace.", nextPath: "/admin/facility/builder?onboarding=workspace" }, { status: 410 });
}
