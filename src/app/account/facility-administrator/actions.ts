"use server";

import { getAppSession } from "@/lib/auth";
import { requirePasswordSession } from "@/lib/credential-policy";
import {
  acceptFacilityAdministratorInvitation,
  declineFacilityAdministratorInvitation,
} from "@/lib/facility-administrator";
import {
  facilityAdministratorActionError,
  type FacilityAdministratorActionResult,
} from "@/lib/facility-administrator/action-result";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";
import { requireAuthenticatedUserSession } from "@/lib/user-session";

async function requireInviteeSession() {
  const session = await requireAuthenticatedUserSession();
  const app = await getAppSession();
  if (app) requirePasswordSession(app);
  return session;
}

export async function acceptFacilityAdministratorInvitationAction(
  _prev: FacilityAdministratorActionResult | null,
  formData: FormData,
): Promise<FacilityAdministratorActionResult> {
  try {
    const session = await requireInviteeSession();
    const result = await acceptFacilityAdministratorInvitation(prisma, {
      actorUserId: session.uid,
      invitationId: String(formData.get("invitationId") ?? ""),
    });
    await trackEvent(
      result.kind === "TRANSFER" ? "facility_administrator.transferred" : "facility_administrator.recovered",
      {
        facilityId: result.facilityId,
        newHolderUserId: session.uid,
        previousHolderUserId: result.previousHolderUserId,
      },
    );
    return { ok: true, message: "You are now the Facility Administrator." };
  } catch (error) {
    return facilityAdministratorActionError(error, "Could not accept the invitation.");
  }
}

export async function declineFacilityAdministratorInvitationAction(
  _prev: FacilityAdministratorActionResult | null,
  formData: FormData,
): Promise<FacilityAdministratorActionResult> {
  try {
    const session = await requireInviteeSession();
    await declineFacilityAdministratorInvitation(prisma, {
      actorUserId: session.uid,
      invitationId: String(formData.get("invitationId") ?? ""),
    });
    return { ok: true, message: "Invitation declined. Nothing changed." };
  } catch (error) {
    return facilityAdministratorActionError(error, "Could not decline the invitation.");
  }
}
