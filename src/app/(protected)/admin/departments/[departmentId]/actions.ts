"use server";

const RETIRED =
  "A room does not have a Location Function. Facility Builder owns the place and who is responsible.";

export type ActionResult =
  | { ok: true; message?: string; profileId?: string }
  | { ok: false; message: string; errors?: string[] };

function retired(): ActionResult {
  return { ok: false, message: RETIRED };
}

export async function createOperationalTypeAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function bindLocationFunctionAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function publishLocationFunctionsAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function ensurePatternDraftAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function bindRoomsToOperationalTypeAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function clearRoomOperationalTypeAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function renameOperationalTypeAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function updateRoomTypeDepartmentUseAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function createArchetypeAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function updateArchetypeAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function bindRoomAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function clearRoomBindingAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function ensureLocationOperationalTypesAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function assignLocationOperationalTypeAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function clearLocationOperationalTypeAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}

export async function createLocationOperationalTypeAction(_formData: FormData): Promise<ActionResult> {
  return retired();
}
