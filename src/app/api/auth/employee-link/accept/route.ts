import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppSession } from "@/lib/auth";
import {
  acceptEmployeeUserLinkInvitation,
  EmployeeIdentityError,
} from "@/lib/employee-identity";
import { prisma } from "@/lib/prisma";

const acceptSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

export async function POST(request: Request) {
  const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Unable to accept this invitation." }, { status: 400 });
  }

  const session = await getAppSession();
  if (!session || session.authKind !== "user") {
    return NextResponse.json(
      { error: "Sign in with the invited email, then return to this link.", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  try {
    const result = await acceptEmployeeUserLinkInvitation(prisma, {
      rawToken: parsed.data.token,
      authenticatedUserId: session.uid,
    });
    return NextResponse.json({ ok: true, facilityId: result.facilityId });
  } catch (error) {
    if (error instanceof EmployeeIdentityError) {
      const status =
        error.code === "WRONG_USER" || error.code === "AUTH_REQUIRED"
          ? 403
          : error.code === "INVITATION_INVALID" || error.code === "EMPLOYEE_INACTIVE"
            ? 400
            : 409;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    throw error;
  }
}
