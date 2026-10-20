import { EmploymentType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppSession } from "@/lib/auth";
import { internalFacilityContextKey } from "@/lib/available-contexts";
import { applyAuthenticatedUserLandingCookies, enterGrantedContext } from "@/lib/post-auth-routing";
import { prisma } from "@/lib/prisma";
import { acceptSetupManagerInvitation, findSetupManagerInvitation, SetupInvitationError } from "./manager-invitations";

const schema = z.object({ employmentType: z.nativeEnum(EmploymentType), token: z.string().min(20).max(200), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), password: z.string().min(10).max(128).optional(), confirmPassword: z.string().optional() });
export async function confirmSetupManagerInvitation(body: unknown) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check your name and password fields." }, { status: 400 });
  const invitation = await findSetupManagerInvitation(prisma, parsed.data.token);
  if (!invitation) return NextResponse.json({ error: "This invitation is invalid, expired or already accepted." }, { status: 400 });
  const session = await getAppSession();
  if (session && (session.authKind !== "user" || session.authMethod === "QUICK_PIN" || session.email?.toLowerCase() !== invitation.email)) {
    return NextResponse.json({ error: "Sign out, then sign in with the invited email to accept this invitation." }, { status: 403 });
  }
  const existing = await prisma.user.findUnique({ where: { email: invitation.email }, select: { passwordHash: true } });
  if (existing?.passwordHash && !session) return NextResponse.json({ error: "Sign in with the invited email, then return to this link." }, { status: 401 });
  if (!existing?.passwordHash && (!parsed.data.password || parsed.data.password !== parsed.data.confirmPassword)) return NextResponse.json({ error: "A matching password is required." }, { status: 400 });
  const passwordHash = !existing?.passwordHash ? await bcrypt.hash(parsed.data.password!, 12) : undefined;
  try {
    const accepted = await acceptSetupManagerInvitation(prisma, { ...parsed.data, rawToken: parsed.data.token, authenticatedUserId: session?.authKind === "user" ? session.uid : null, passwordHash });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: accepted.userId }, select: { sessionVersion: true } });
    const landing = await enterGrantedContext(prisma, { userId: accepted.userId, contextKey: internalFacilityContextKey(accepted.facilityId), sessionVersion: user.sessionVersion });
    const response = NextResponse.json({ ok: true, nextPath: landing.redirectPath });
    applyAuthenticatedUserLandingCookies(response.cookies, landing);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof SetupInvitationError ? error.message : "Could not accept this invitation. Sign in to check your access before retrying." }, { status: 400 });
  }
}
