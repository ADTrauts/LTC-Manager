import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppSession } from "@/lib/auth";
import { normalizeAccountIdentifier } from "@/lib/auth-rate-limit";
import { organizationContextKey } from "@/lib/available-contexts";
import {
  OrganizationMemberInvitationError,
  acceptOrganizationMemberInvitation,
  findAcceptableMemberInvitationByRawToken,
} from "@/lib/organization-member-invitations";
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
  const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Unable to accept this invitation." },
      { status: 400 },
    );
  }

  const invitation = await findAcceptableMemberInvitationByRawToken(prisma, parsed.data.token);
  if (!invitation) {
    return NextResponse.json(
      { error: "This invitation link is invalid, expired, or already used." },
      { status: 400 },
    );
  }

  const session = await getAppSession();
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.targetEmailNormalized },
    select: { id: true, passwordHash: true },
  });
  if (session?.authKind === "user") {
    const sessionEmail = normalizeAccountIdentifier(session.email ?? "");
    if (sessionEmail !== invitation.targetEmailNormalized) {
      return NextResponse.json(
        { error: "This invitation belongs to a different email address.", code: "EMAIL_MISMATCH" },
        { status: 403 },
      );
    }
  }

  let passwordHash: string | null | undefined;
  const needsPassword = !existingUser || !existingUser.passwordHash;
  if (needsPassword) {
    if (!parsed.data.password || parsed.data.password !== parsed.data.confirmPassword) {
      return NextResponse.json({ error: "Password is required and must match." }, { status: 400 });
    }
    passwordHash = await bcrypt.hash(parsed.data.password, 12);
  } else if (!session || session.authKind !== "user") {
    return NextResponse.json(
      { error: "Sign in with the invited email, then return to this link.", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  try {
    const result = await acceptOrganizationMemberInvitation(prisma, {
      rawToken: parsed.data.token,
      authenticatedUserId: session?.authKind === "user" ? session.uid : null,
      passwordHash: passwordHash ?? null,
      displayName: parsed.data.displayName ?? null,
    });
    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { id: true, sessionVersion: true, isActive: true },
    });
    if (!user?.isActive) {
      return NextResponse.json({ error: "Account missing after acceptance." }, { status: 500 });
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
    if (error instanceof OrganizationMemberInvitationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error instanceof PostAuthRoutingError) {
      return NextResponse.json({ error: "Could not accept invitation." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not accept invitation." }, { status: 500 });
  }
}
