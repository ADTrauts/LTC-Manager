import { NextResponse } from "next/server";
import { z } from "zod";

import { internalFacilityContextKey } from "@/lib/available-contexts";
import { consumeEmailVerificationToken } from "@/lib/email-verification/tokens";
import { resolveCurrentInternalFacilityRole } from "@/lib/facility-access/internal-facility-role";
import { isOnboardingComplete, ONBOARDING_ENTRY_PATH } from "@/lib/onboarding";
import {
  applyAuthenticatedUserLandingCookies,
  enterGrantedContext,
  PostAuthRoutingError,
  routeAuthenticatedUser,
} from "@/lib/post-auth-routing";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

const confirmSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

const INVITE_PENDING_MESSAGE =
  "Accept the invite email we sent to set your password before signing in.";

async function loadCurrentUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      facilityId: true,
      passwordHash: true,
      sessionVersion: true,
      isActive: true,
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  }

  const userId = await consumeEmailVerificationToken(prisma, parsed.data.token);
  if (!userId) {
    return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  }

  const user = await loadCurrentUser(userId);
  if (!user?.isActive) {
    return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  }

  if (!user.passwordHash) {
    return NextResponse.json(
      {
        error: INVITE_PENDING_MESSAGE,
        code: "INVITE_PENDING",
      },
      { status: 403 },
    );
  }

  try {
    const homeFacilityId = user.facilityId;
    const homeRole = homeFacilityId
      ? await resolveCurrentInternalFacilityRole(prisma, {
          userId: user.id,
          facilityId: homeFacilityId,
        })
      : null;

    let landing;
    let nextPath: string;
    if (homeFacilityId && homeRole) {
      landing = await enterGrantedContext(prisma, {
        userId: user.id,
        contextKey: internalFacilityContextKey(homeFacilityId),
        sessionVersion: user.sessionVersion,
      });
      const facility = await prisma.facility.findUnique({
        where: { id: homeFacilityId },
        select: { onboardingCompletedAt: true },
      });
      nextPath =
        landing.kind === "context" && facility && !isOnboardingComplete(facility)
          ? ONBOARDING_ENTRY_PATH
          : landing.redirectPath;
    } else {
      landing = await routeAuthenticatedUser(prisma, {
        userId: user.id,
        sessionVersion: user.sessionVersion,
      });
      nextPath = landing.redirectPath;
    }

    await trackEvent("signup.email_verified", {
      facilityId: homeFacilityId,
      userId: user.id,
    });

    const response = NextResponse.json({ ok: true, nextPath });
    applyAuthenticatedUserLandingCookies(response.cookies, landing);
    return response;
  } catch (error) {
    if (error instanceof PostAuthRoutingError) {
      return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to complete verification." }, { status: 500 });
  }
}
