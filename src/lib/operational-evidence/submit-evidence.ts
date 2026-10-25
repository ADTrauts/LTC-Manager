import type { FacilitySession } from "@/lib/auth";

import type { SubmitEvidenceInput } from "./types";

/**
 * Template-backed submit is retired. Forward Records use the Catalog submit path.
 */
export async function submitEvidenceRecord(
  _session: FacilitySession,
  _input: SubmitEvidenceInput & {
    actorUserId?: string | null;
    client?: unknown;
    now?: Date;
  },
): Promise<never> {
  throw new Error("Operational templates are retired. Submit Records through the Catalog.");
}
