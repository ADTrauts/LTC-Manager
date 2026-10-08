"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createOrganizationSessionToken,
  createPartnerFacilitySessionToken,
  getCookieOptions,
  isPartnerFacilitySession,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/auth";
import { requireOrganizationSession } from "@/lib/organization-context";
import {
  PartnerFacilitySessionError,
  resolvePartnerFacilityEntry,
  resolvePartnerFacilityExit,
} from "@/lib/partner-facility-session";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

export async function enterPartnerFacilityAction(formData: FormData): Promise<void> {
  const facilityId = String(formData.get("facilityId") ?? "");
  const facilityPartnerOrganizationId = String(formData.get("facilityPartnerOrganizationId") ?? "");
  const { session } = await requireOrganizationSession();
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, email: true, displayName: true, sessionVersion: true },
  });
  if (!user?.email) {
    redirect("/login");
  }

  let authorization;
  try {
    authorization = await resolvePartnerFacilityEntry(prisma, {
      userId: user.id,
      organizationId: session.organizationId,
      facilityId,
      facilityPartnerOrganizationId,
    });
  } catch (error) {
    if (error instanceof PartnerFacilitySessionError) {
      redirect(`/organization/${session.organizationId}`);
    }
    throw error;
  }

  const token = await createPartnerFacilitySessionToken({
    uid: user.id,
    name: user.displayName,
    email: user.email,
    facilityId: authorization.facilityId,
    partnerOrganizationId: authorization.partnerOrganizationId,
    facilityPartnerOrganizationId: authorization.facilityPartnerOrganizationId,
    sessionVersion: user.sessionVersion,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, getCookieOptions());

  await trackEvent("partner_session.entered", {
    userId: user.id,
    facilityId: authorization.facilityId,
    partnerOrganizationId: authorization.partnerOrganizationId,
    facilityPartnerOrganizationId: authorization.facilityPartnerOrganizationId,
  });
  redirect("/partner");
}

export async function leavePartnerFacilityAction(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) redirect("/login");

  let payload;
  try {
    payload = await verifySessionToken(raw);
  } catch {
    jar.set(SESSION_COOKIE, "", { ...getCookieOptions(), maxAge: 0 });
    redirect("/login");
  }
  if (!isPartnerFacilitySession(payload)) {
    redirect("/partner");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, email: true, displayName: true, sessionVersion: true, isActive: true },
  });
  const exit = await resolvePartnerFacilityExit(prisma, {
    uid: payload.uid,
    partnerOrganizationId: payload.partnerOrganizationId,
  });
  if (!user?.isActive || !user.email || exit.action === "login") {
    jar.set(SESSION_COOKIE, "", { ...getCookieOptions(), maxAge: 0 });
    redirect("/login");
  }

  const token = await createOrganizationSessionToken({
    uid: user.id,
    authMethod: "PASSWORD",
    name: user.displayName,
    email: user.email,
    organizationId: exit.organizationId,
    sessionVersion: user.sessionVersion,
  });
  jar.set(SESSION_COOKIE, token, getCookieOptions());
  await trackEvent("partner_session.left", {
    userId: user.id,
    facilityId: payload.facilityId,
    partnerOrganizationId: payload.partnerOrganizationId,
    facilityPartnerOrganizationId: payload.facilityPartnerOrganizationId,
  });
  redirect(`/organization/${exit.organizationId}`);
}
