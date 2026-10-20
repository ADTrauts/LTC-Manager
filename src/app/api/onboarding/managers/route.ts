import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFacilitySession } from "@/lib/facility-context";
import { issueSetupManagerInvitation, deliverSetupManagerInvitation, assertSetupInvitationActor, SetupInvitationError } from "@/lib/onboarding/manager-invitations";
import { prisma } from "@/lib/prisma";
import { resolveRequestOrigin } from "@/lib/billing/request-origin";

const schema = z.object({ expectedFacilityId: z.string().cuid(), emails: z.array(z.email().max(200)).min(1).max(20), retry: z.boolean().optional() });
export async function POST(request: Request) {
  const session = await requireFacilitySession();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid manager emails and refresh your Facility context." }, { status: 400 });
  try { assertSetupInvitationActor(session, parsed.data.expectedFacilityId); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 403 }); }
  const origin = await resolveRequestOrigin();
  const rows = [];
  for (const email of [...new Set(parsed.data.emails.map((email) => email.toLowerCase()))]) {
    try {
      const issued = await issueSetupManagerInvitation(prisma, session, { expectedFacilityId: parsed.data.expectedFacilityId, email, retry: parsed.data.retry });
      const delivered = await deliverSetupManagerInvitation(prisma, { ...issued, origin });
      rows.push({ email, ...delivered });
    } catch (error) {
      rows.push({ email, error: error instanceof SetupInvitationError ? error.message : "Invitation could not be completed. Refresh to inspect its status before retrying." });
    }
  }
  return NextResponse.json({ ok: true, rows });
}
