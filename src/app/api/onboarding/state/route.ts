import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { loadSetupWorkspace } from "@/lib/onboarding/workspace";
import { isValidIanaTimezone } from "@/lib/operational-time/resolve-facility-timezone";
import { requirePasswordSession } from "@/lib/credential-policy";
import { requireFacilitySession } from "@/lib/facility-context";
import { normalizeOnboardingStep, ONBOARDING_STEPS } from "@/lib/onboarding";
import { saveFacilityOnboarding } from "@/lib/onboarding/transitions";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

const updateStateSchema = z.object({
  expectedFacilityId: z.string().cuid().optional(),
  timezone: z.string().trim().max(100).refine(isValidIanaTimezone, "Choose a valid IANA timezone.").optional(),
  confirmEntry: z.boolean().optional(),
  facilityName: z.string().trim().min(2).max(200).optional(),
  managementCompanyName: z.string().trim().max(200).optional(),
  billingEmail: z.string().email().max(200).optional(),
  step: z.enum(ONBOARDING_STEPS).optional(),
  completeOnboarding: z.boolean().optional(),
  setupPath: z.enum(["SELF_SERVE", "ASSISTED"]).optional(),
});

export async function GET() {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const workspace = await loadSetupWorkspace(prisma, session);
  return NextResponse.json({ ...workspace, facility: { ...workspace.facility, onboardingCurrentStep: normalizeOnboardingStep(workspace.facility.onboardingCurrentStep) } });
}

export async function PATCH(request: Request) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const body = await request.json().catch(() => null);
  const parsed = updateStateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid onboarding update." }, { status: 400 });
  }

  const data = parsed.data;
  requirePasswordSession(session);
  if (data.expectedFacilityId && data.expectedFacilityId !== session.facilityId) return NextResponse.json({ error: "Facility changed. Reload setup before saving." }, { status: 409 });
  if (data.confirmEntry && (!data.timezone || !data.facilityName)) return NextResponse.json({ error: "Confirm the site name and timezone." }, { status: 400 });

  const updated = await saveFacilityOnboarding(prisma, {
    facilityId: session.facilityId,
    timezone: data.timezone, confirmEntry: data.confirmEntry,
    facilityName: data.facilityName,
    billingEmail: data.billingEmail,
    step: data.step,
    finish: data.completeOnboarding,
    setupPath: data.setupPath,
  });

  await trackEvent("onboarding.state.updated", {
    facilityId: session.facilityId,
    step: updated.onboardingCurrentStep,
    entryConfirmed: data.confirmEntry === true,
    completeOnboarding: data.completeOnboarding === true,
  });

  return NextResponse.json({
    ok: true,
    facility: {
      ...updated,
      onboardingCurrentStep: normalizeOnboardingStep(updated.onboardingCurrentStep),
    },
  });
}

const eventSchema = z.object({
  expectedFacilityId: z.string().cuid(),
  event: z.enum(["viewed", "step_viewed", "left"]),
  step: z.string().regex(/^(site|products|building|equipment|people|finish|department:[A-Z0-9_]+)$/),
  elapsedMs: z.number().min(0).max(86_400_000).optional(),
});
export async function POST(request: Request) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.expectedFacilityId !== session.facilityId) return NextResponse.json({ error: "Invalid setup context." }, { status: 400 });
  await trackEvent(`onboarding.workspace.${parsed.data.event}`, { facilityId: session.facilityId, actorKind: session.authKind, step: parsed.data.step, elapsedMs: parsed.data.elapsedMs });
  return NextResponse.json({ ok: true });
}
