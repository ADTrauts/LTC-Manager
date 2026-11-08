"use server";

import { LOCATION_FUNCTION_AUTHORING_RETIRED } from "@/lib/department-administration/profile-service";

export type ActionResult =
  | { ok: true; message?: string; profileId?: string }
  | { ok: false; message: string; errors?: string[] };

const RETIRED: ActionResult = {
  ok: false,
  message: LOCATION_FUNCTION_AUTHORING_RETIRED,
};

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function createOperationalTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function bindLocationFunctionAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function publishLocationFunctionsAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function ensurePatternDraftAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function bindRoomsToOperationalTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function clearRoomOperationalTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function renameOperationalTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function updateRoomTypeDepartmentUseAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function createArchetypeAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function updateArchetypeAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function bindRoomAction(formData: FormData): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function clearRoomBindingAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function ensureLocationOperationalTypesAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function assignLocationOperationalTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function clearLocationOperationalTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}

/** @deprecated Location Function authoring retired (Phase 2A / ARR-026). */
export async function createLocationOperationalTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return RETIRED;
}
