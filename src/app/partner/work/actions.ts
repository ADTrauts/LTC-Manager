"use server";

import { GENERIC_WORK_AUTHORING_RETIRED } from "@/lib/department-work";

export type PartnerWorkResult = { ok: boolean; message: string } | null;

/** @deprecated Generic Work Plan authoring retired (Phase 2B). */
export async function addPartnerWorkPlanAction(
  _previous: PartnerWorkResult,
  _formData: FormData,
): Promise<PartnerWorkResult> {
  return { ok: false, message: GENERIC_WORK_AUTHORING_RETIRED };
}

/** @deprecated Generic Work Plan authoring retired (Phase 2B). */
export async function publishPartnerWorkPlanAction(
  _previous: PartnerWorkResult,
  _formData: FormData,
): Promise<PartnerWorkResult> {
  return { ok: false, message: GENERIC_WORK_AUTHORING_RETIRED };
}
