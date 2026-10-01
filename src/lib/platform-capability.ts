/**
 * Platform capabilities. Operational code asks for a capability.
 * The current grant table uses the existing role ladder in this one place.
 */

import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AuthKind } from "@/lib/auth";

export type PlatformCapability = "operational_timing.adjust";

export function hasPlatformCapability(input: {
  capability: PlatformCapability;
  role: AppRole;
  authKind: AuthKind;
}): boolean {
  if (input.authKind === "harbor_staff") return false;
  if (input.capability === "operational_timing.adjust") {
    return hasAtLeastRole(input.role, "SUPERVISOR");
  }
  return false;
}
