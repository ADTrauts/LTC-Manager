import type { AppJwtPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Operational employee id for the signed-in actor (PIN = employee id; User = roster row match by email).
 */
export async function getOperationalEmployeeIdForSession(session: AppJwtPayload): Promise<string | null> {
  if (session.authKind === "employee") {
    return session.uid ?? null;
  }
  const email = session.email.trim().toLowerCase();
  if (!email || !session.facilityId) return null;
  const emp = await prisma.employee.findFirst({
    where: {
      facilityId: session.facilityId,
      email: { equals: email, mode: "insensitive" },
    },
    select: { id: true },
  });
  return emp?.id ?? null;
}
