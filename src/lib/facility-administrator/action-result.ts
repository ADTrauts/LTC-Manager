import { InternalFacilityRoleError } from "@/lib/facility-access";

import { FacilityAdministratorInvitationError } from "./service";

export type FacilityAdministratorActionResult = { ok: true; message: string } | { ok: false; message: string };

export function facilityAdministratorActionError(error: unknown, fallback: string): FacilityAdministratorActionResult {
  if (error instanceof FacilityAdministratorInvitationError || error instanceof InternalFacilityRoleError) {
    return { ok: false, message: error.message };
  }
  console.error(fallback, error);
  return { ok: false, message: fallback };
}

export function invitationDeliveryMessage(sent: boolean, reason?: string): string {
  if (sent) return "Invitation sent. Nothing changes until they accept.";
  if (reason === "not_configured") {
    return "Invitation created. Email delivery is not configured; they will see it under My Account.";
  }
  return "Invitation created, but the email could not be delivered. They will see it under My Account.";
}
