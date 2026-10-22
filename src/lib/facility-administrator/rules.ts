import { RoleKey, type FacilityAdministratorInvitationStatus } from "@prisma/client";

/** Roles the outgoing Facility Administrator may keep after a transfer. */
export const OUTGOING_ROLE_CHOICES = [RoleKey.GM, RoleKey.MANAGER, RoleKey.SUPERVISOR] as const;
export type OutgoingRoleChoice = (typeof OUTGOING_ROLE_CHOICES)[number];
export const DEFAULT_OUTGOING_ROLE: OutgoingRoleChoice = RoleKey.MANAGER;

export const FACILITY_ADMINISTRATOR_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isOutgoingRoleChoice(value: unknown): value is OutgoingRoleChoice {
  return typeof value === "string" && (OUTGOING_ROLE_CHOICES as readonly string[]).includes(value);
}

export type HolderGoneReason = "ACCOUNT_INACTIVE" | "ACCESS_ENDED" | "EMPLOYMENT_ENDED";

export const HOLDER_GONE_REASON_LABEL: Record<HolderGoneReason, string> = {
  ACCOUNT_INACTIVE: "Account is inactive",
  ACCESS_ENDED: "Facility access has ended",
  EMPLOYMENT_ENDED: "Employment has ended",
};

/** A holder is gone when their account, their access to this facility, or their employment here has ended. */
export function holderGoneReason(facts: {
  userActive: boolean;
  accessActive: boolean;
  employmentEnded: boolean;
}): HolderGoneReason | null {
  if (!facts.userActive) return "ACCOUNT_INACTIVE";
  if (!facts.accessActive) return "ACCESS_ENDED";
  if (facts.employmentEnded) return "EMPLOYMENT_ENDED";
  return null;
}

export type FacilityAdministratorHolder = {
  userId: string;
  displayName: string;
  email: string;
  periodId: string;
  since: Date;
};

export type FacilityAdministratorSeat =
  | { kind: "EMPTY" }
  | { kind: "HELD"; holder: FacilityAdministratorHolder }
  | { kind: "GONE"; holder: FacilityAdministratorHolder; reason: HolderGoneReason };

/** The parent organization may appoint only when nobody is actively in the seat. */
export function organizationMayAppoint(seat: FacilityAdministratorSeat): boolean {
  return seat.kind !== "HELD";
}

export function invitationIsLive(
  invitation: { status: FacilityAdministratorInvitationStatus; expiresAt: Date },
  now: Date,
): boolean {
  return invitation.status === "PENDING" && invitation.expiresAt.getTime() > now.getTime();
}
