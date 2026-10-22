import { sendFacilityAdministratorInvitationEmail } from "@/lib/email/facility-administrator-invitation";

import { invitationDeliveryMessage } from "./action-result";
import { FACILITY_ADMINISTRATOR_INVITATION_TTL_MS } from "./rules";
import type { FacilityAdministratorInvitationView } from "./service";

export const FACILITY_ADMINISTRATOR_INVITATIONS_PATH = "/account/facility-administrator";

/** Emails the invitee a link to review it under My Account. The invitation is already saved. */
export async function deliverFacilityAdministratorInvitation(
  invitation: FacilityAdministratorInvitationView,
  origin: string,
): Promise<string> {
  try {
    const result = await sendFacilityAdministratorInvitationEmail({
      to: invitation.invitee.email,
      facilityDisplayName: invitation.facilityName,
      invitedByName: invitation.invitedBy?.displayName ?? "",
      kind: invitation.kind,
      reviewUrl: `${origin}${FACILITY_ADMINISTRATOR_INVITATIONS_PATH}`,
      expiresInDays: Math.round(FACILITY_ADMINISTRATOR_INVITATION_TTL_MS / (24 * 60 * 60 * 1000)),
    });
    return invitationDeliveryMessage(result.sent, result.sent ? undefined : result.reason);
  } catch (error) {
    console.error("Facility Administrator invitation email failed.", error);
    return invitationDeliveryMessage(false, "send_failed");
  }
}
