import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFacilitySession } from "@/lib/facility-context";
import { issueSetupManagerInvitation, deliverSetupManagerInvitation, nameExistingDepartmentHead, assertSetupInvitationActor, SetupInvitationError } from "@/lib/onboarding/manager-invitations";
import { prisma } from "@/lib/prisma";
import { resolveRequestOrigin } from "@/lib/billing/request-origin";

const schema = z.object({
  expectedFacilityId: z.string().cuid(),
  emails: z.array(z.email().max(200)).min(1).max(20),
  retry: z.boolean().optional(),
  departmentId: z.string().cuid().optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
}).superRefine((value, ctx) => {
  if (!value.departmentId) return;
  if (value.emails.length !== 1) ctx.addIssue({ code: "custom", message: "Name one Department head at a time.", path: ["emails"] });
  if (!value.firstName || !value.lastName) ctx.addIssue({ code: "custom", message: "Enter the Department head's first and last name.", path: ["firstName"] });
});
export async function POST(request: Request) {
  const session = await requireFacilitySession();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const refined = parsed.error.issues.find((issue) => issue.code === "custom");
    return NextResponse.json({ error: refined?.message ?? "Enter valid manager emails and refresh your Facility context." }, { status: 400 });
  }
  try { assertSetupInvitationActor(session, parsed.data.expectedFacilityId); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 403 }); }
  const origin = await resolveRequestOrigin();
  if (parsed.data.departmentId) {
    const email = parsed.data.emails[0]!;
    try {
      const named = await nameExistingDepartmentHead(prisma, session, { expectedFacilityId: parsed.data.expectedFacilityId, departmentId: parsed.data.departmentId, email });
      if (named) return NextResponse.json({ ok: true, rows: [{ email, named: true, headName: named.name }] });
      const issued = await issueSetupManagerInvitation(prisma, session, { expectedFacilityId: parsed.data.expectedFacilityId, email, retry: true, departmentId: parsed.data.departmentId, firstName: parsed.data.firstName, lastName: parsed.data.lastName });
      const delivered = await deliverSetupManagerInvitation(prisma, { ...issued, origin });
      return NextResponse.json({ ok: true, rows: [{ email, ...delivered }] });
    } catch (error) {
      return NextResponse.json({ ok: true, rows: [{ email, error: error instanceof SetupInvitationError ? error.message : "Invitation could not be completed. Refresh to inspect its status before retrying." }] });
    }
  }
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
