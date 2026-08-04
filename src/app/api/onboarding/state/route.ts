import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { normalizeOnboardingStep, ONBOARDING_STEPS } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

function isStripeBillingFullyConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  );
}

const updateStateSchema = z.object({
  facilityName: z.string().trim().min(2).max(200).optional(),
  managementCompanyName: z.string().trim().max(200).optional(),
  billingEmail: z.string().email().max(200).optional(),
  step: z.enum(ONBOARDING_STEPS).optional(),
  completeOnboarding: z.boolean().optional(),
});

export async function GET() {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: {
      id: true,
      displayName: true,
      managementCompanyName: true,
      billingEmail: true,
      onboardingCurrentStep: true,
      onboardingStartedAt: true,
      onboardingCompletedAt: true,
    },
  });

  if (!facility) {
    return NextResponse.json({ error: "Facility not found." }, { status: 404 });
  }

  const managerInvites = await prisma.onboardingManagerInvite.findMany({
    where: { facilityId: session.facilityId },
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    facility: {
      ...facility,
      onboardingCurrentStep: normalizeOnboardingStep(facility.onboardingCurrentStep),
    },
    managerInvites,
    stripeBillingReady: isStripeBillingFullyConfigured(),
  });
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

  if (data.completeOnboarding === true) {
    const stripeReady = isStripeBillingFullyConfigured();
    if (stripeReady) {
      const facilityRow = await prisma.facility.findUnique({
        where: { id: session.facilityId },
        select: { stripeDefaultPaymentMethodId: true },
      });
      if (!facilityRow?.stripeDefaultPaymentMethodId) {
        return NextResponse.json(
          { error: "Add a payment method before finishing setup, or turn off Stripe keys to skip in development." },
          { status: 400 },
        );
      }
    }
  }

  const updated = await prisma.facility.update({
    where: { id: session.facilityId },
    data: {
      displayName: data.facilityName,
      managementCompanyName:
        data.managementCompanyName !== undefined
          ? data.managementCompanyName.trim() === ""
            ? null
            : data.managementCompanyName
          : undefined,
      billingEmail: data.billingEmail ? data.billingEmail.toLowerCase() : undefined,
      onboardingCurrentStep: data.step,
      onboardingStartedAt: new Date(),
      onboardingCompletedAt: data.completeOnboarding ? new Date() : undefined,
    },
    select: {
      id: true,
      displayName: true,
      managementCompanyName: true,
      billingEmail: true,
      onboardingCurrentStep: true,
      onboardingCompletedAt: true,
    },
  });

  await trackEvent("onboarding.state.updated", {
    facilityId: session.facilityId,
    step: data.step ?? updated.onboardingCurrentStep,
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
