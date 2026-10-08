"use server";

import { revalidatePath } from "next/cache";

import { getPartnerFacilitySession } from "@/lib/auth";
import { correctPartnerCanonicalLog, submitPartnerCanonicalLog } from "@/lib/canonical-logs/partner-log-write";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import type { EvidenceFieldValueInput } from "@/lib/operational-evidence/types";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export type PartnerLogMutationResult =
  | { ok: true; recordId: string; redirectTo: string }
  | { ok: false; error: string; existingRecordId?: string };

export async function submitPartnerCanonicalLogAction(input: {
  logAttachmentId: string;
  requirementKey?: string | null;
  operationalDateKey: string;
  cycleStableKey?: string | null;
  cycleLabel?: string | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  values: EvidenceFieldValueInput[];
  correctiveActionText?: string | null;
  adHoc?: boolean;
}): Promise<PartnerLogMutationResult> {
  if (!isCanonicalLogsEnabled()) return { ok: false, error: "Canonical Logs are not enabled." };
  const session = await getPartnerFacilitySession();
  if (!session) return { ok: false, error: "Partner Log submission denied." };
  const context = await requirePartnerOperationalContext();

  try {
    const record = await submitPartnerCanonicalLog({
      client: prisma,
      context,
      actorLabel: session.name,
      logAttachmentId: input.logAttachmentId,
      requirementKey: input.requirementKey,
      operationalDateKey: input.operationalDateKey,
      cycleStableKey: input.cycleStableKey,
      cycleLabel: input.cycleLabel,
      windowStartLocal: input.windowStartLocal,
      windowEndLocal: input.windowEndLocal,
      values: input.values,
      correctiveActionText: input.correctiveActionText,
      adHoc: input.adHoc === true,
    });
    revalidatePath("/partner/logs");
    return { ok: true, recordId: record.id, redirectTo: `/partner/logs/records/${record.id}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not submit Log.";
    if (/not found|denied|require the active Department/i.test(message)) {
      return { ok: false, error: "Log not found." };
    }
    return { ok: false, error: message };
  }
}

export async function correctPartnerCanonicalLogAction(input: {
  recordId: string;
  reason: string;
  values: EvidenceFieldValueInput[];
  correctiveActionText?: string | null;
}): Promise<PartnerLogMutationResult> {
  if (!isCanonicalLogsEnabled()) return { ok: false, error: "Canonical Logs are not enabled." };
  const session = await getPartnerFacilitySession();
  if (!session) return { ok: false, error: "Partner Log correction denied." };
  const context = await requirePartnerOperationalContext();

  try {
    const record = await correctPartnerCanonicalLog({
      client: prisma,
      context,
      actorLabel: session.name,
      recordId: input.recordId,
      reason: input.reason,
      values: input.values,
      correctiveActionText: input.correctiveActionText,
    });
    revalidatePath("/partner/logs");
    return { ok: true, recordId: record.id, redirectTo: `/partner/logs/records/${record.id}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not correct Log.";
    if (/not found|denied|require the active Department/i.test(message)) {
      return { ok: false, error: "Log not found." };
    }
    return { ok: false, error: message };
  }
}
