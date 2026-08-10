import type { AppJwtPayload } from "@/lib/auth";
import { requireAtLeastRole, type AppRole } from "@/lib/access";

/**
 * Bulk imports are BUILD configuration actions.
 * Quick PIN is RUN-only and must never authorize imports.
 */
export function requireBulkImportAuthority(
  session: AppJwtPayload,
  minRole: AppRole,
): void {
  if (session.authMethod === "QUICK_PIN") {
    throw new Error("Quick PIN sessions cannot run bulk imports. Sign in with a password.");
  }
  requireAtLeastRole(session.role, minRole);
}
