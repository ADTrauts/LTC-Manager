/**
 * A waiver is one sparse fact for one expected slot.
 * It is rejected when the requirement disallows waivers or a Record already exists.
 */

export function waiverCreateDecision(input: {
  waiverAllowed: boolean;
  slotAlreadyRecorded: boolean;
  actorMaySubmit: boolean;
  reason: string;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.actorMaySubmit) {
    return { ok: false, reason: "You are not allowed to waive this Record." };
  }
  if (!input.waiverAllowed) {
    return { ok: false, reason: "This Record requirement does not allow a waiver." };
  }
  if (input.slotAlreadyRecorded) {
    return { ok: false, reason: "A Record already exists for this slot." };
  }
  if (!input.reason.trim()) {
    return { ok: false, reason: "A waiver needs a reason." };
  }
  return { ok: true };
}
