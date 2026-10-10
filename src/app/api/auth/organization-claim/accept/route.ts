import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppSession } from "@/lib/auth";
import { normalizeAccountIdentifier } from "@/lib/auth-rate-limit";
import { organizationContextKey } from "@/lib/available-contexts";
import {
  OrganizationClaimError,
  acceptOrganizationClaim,
  findClaimableInvitationByRawToken,
} from "@/lib/organization-claims";
import {
  applyAuthenticatedUserLandingCookies,
  enterGrantedContext,
  PostAuthRoutingError,
} from "@/lib/post-auth-routing";
import { prisma } from "@/lib/prisma";

const acceptSchema = z.object({
  token: z.string().trim().min(20).max(200),
  password: z.string().min(10).max(128).optional(),
  confirmPassword: z.string().min(10).max(128).optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Unable to accept this claim." },
      { status: 400 },
    );
  }

  const claim = await findClaimableInvitationByRawToken(prisma, parsed.data.token);
  if (!claim) {
    return NextResponse.json(
      { error: "This claim link is invalid, expired, or already used." },
      { status: 400 },
    );
  }

  const session = await getAppSession();
  const existingUser = await prisma.user.findUnique({
    where: { email: claim.targetEmailNormalized },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (session?.authKind === "user") {
    const sessionEmail = normalizeAccountIdentifier(session.email ?? "");
    if (sessionEmail !== claim.targetEmailNormalized) {
      return NextResponse.json(
        {
          error:
            "This claim invitation belongs to a different email address. Sign out and continue with the invited account.",
          code: "EMAIL_MISMATCH",
        },
        { status: 403 },
      );
    }
  }

  let passwordHash: string | null | undefined;
  const needsPassword = !existingUser || !existingUser.passwordHash;

  if (needsPassword) {
    if (!parsed.data.password || !parsed.data.confirmPassword) {
      return NextResponse.json(
        { error: "Password is required to finish this claim." },
        { status: 400 },
      );
    }
    if (parsed.data.password !== parsed.data.confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }
    passwordHash = await bcrypt.hash(parsed.data.password, 12);
  } else if (!session || session.authKind !== "user") {
    return NextResponse.json(
      {
        error: "Sign in with the invited email, then return to this claim link to accept.",
        code: "AUTH_REQUIRED",
      },
      { status: 401 },
    );
  }

  try {
    const result = await acceptOrganizationClaim(prisma, {
      rawToken: parsed.data.token,
      authenticatedUserId: session?.authKind === "user" ? session.uid : null,
      passwordHash: passwordHash ?? null,
      displayName: parsed.data.displayName ?? null,
    });

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: {
        id: true,
        sessionVersion: true,
        isActive: true,
      },
    });
    if (!user?.isActive) {
      return NextResponse.json({ error: "Account missing after claim acceptance." }, { status: 500 });
    }

    const landing = await enterGrantedContext(prisma, {
      userId: user.id,
      contextKey: organizationContextKey(result.organizationId),
      sessionVersion: user.sessionVersion,
    });

    const response = NextResponse.json({
      ok: true,
      nextPath: landing.redirectPath,
    });
    applyAuthenticatedUserLandingCookies(response.cookies, landing);
    return response;
  } catch (error) {
    if (error instanceof OrganizationClaimError) {
      const status =
        error.code === "EMAIL_MISMATCH" || error.code === "FORBIDDEN"
          ? 403
          : error.code === "ALREADY_ADMINISTRABLE" || error.code === "CLAIM_ALREADY_ACCEPTED"
            ? 409
            : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (error instanceof PostAuthRoutingError) {
      return NextResponse.json({ error: "Unable to accept this claim." }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to accept this claim." }, { status: 500 });
  }
}
