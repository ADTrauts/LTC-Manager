"use server";

import { revalidatePath } from "next/cache";

import { getSession, sessionUserIdForFk } from "@/lib/auth";
import { isDietaryOperationalEvidenceEnabled } from "@/lib/feature-flags";
import {
  createDraft,
  createDraftFromPreset,
  isOperationalEvidencePresetKey,
  publishTemplate,
  retireTemplate,
  updateDraft,
  type TemplateDraftInput,
} from "@/lib/operational-evidence";

function actorFromSession(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  return {
    userId: sessionUserIdForFk(session),
    label: session.name || session.email || null,
  };
}

export async function createEvidenceTemplateDraftAction(input: {
  facilityId: string;
  departmentId: string;
  draft: TemplateDraftInput;
}) {
  if (!isDietaryOperationalEvidenceEnabled()) {
    throw new Error("Dietary Operational Evidence is not enabled.");
  }
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const created = await createDraft(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    draft: input.draft,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/templates");
  return { id: created.id };
}

export async function createEvidencePresetDraftAction(input: {
  facilityId: string;
  departmentId: string;
  presetKey: string;
}) {
  if (!isDietaryOperationalEvidenceEnabled()) {
    throw new Error("Dietary Operational Evidence is not enabled.");
  }
  if (!isOperationalEvidencePresetKey(input.presetKey)) {
    throw new Error("Unknown template preset.");
  }
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const created = await createDraftFromPreset(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    presetKey: input.presetKey,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/templates");
  return { id: created.id };
}

export async function updateEvidenceTemplateDraftAction(input: {
  facilityId: string;
  departmentId: string;
  templateId: string;
  draft: TemplateDraftInput;
}) {
  if (!isDietaryOperationalEvidenceEnabled()) {
    throw new Error("Dietary Operational Evidence is not enabled.");
  }
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  await updateDraft(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    templateId: input.templateId,
    draft: input.draft,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/templates");
}

export async function publishEvidenceTemplateAction(input: {
  facilityId: string;
  departmentId: string;
  templateId: string;
}) {
  if (!isDietaryOperationalEvidenceEnabled()) {
    throw new Error("Dietary Operational Evidence is not enabled.");
  }
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  await publishTemplate(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    templateId: input.templateId,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/templates");
  revalidatePath("/staffing/operations");
}

export async function retireEvidenceTemplateAction(input: {
  facilityId: string;
  departmentId: string;
  templateId: string;
}) {
  if (!isDietaryOperationalEvidenceEnabled()) {
    throw new Error("Dietary Operational Evidence is not enabled.");
  }
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  await retireTemplate(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    templateId: input.templateId,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/templates");
}

/**
 * Create a successor Draft from a published (or retired) Template version.
 * Does not mutate the published version.
 */
export async function createEvidenceSuccessorDraftAction(input: {
  facilityId: string;
  departmentId: string;
  templateId: string;
}) {
  if (!isDietaryOperationalEvidenceEnabled()) {
    throw new Error("Dietary Operational Evidence is not enabled.");
  }
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const { loadTemplateDetail } = await import("@/lib/operational-evidence");
  const detail = await loadTemplateDetail({
    session,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    templateId: input.templateId,
  });
  const t = detail.template;
  if (t.status !== "PUBLISHED" && t.status !== "RETIRED") {
    throw new Error("Successor drafts are created from published or retired versions.");
  }
  const draft: TemplateDraftInput = {
    name: t.name,
    description: t.description,
    instructions: t.instructions,
    purposeType: t.purposeType,
    allowAdHoc: t.allowAdHoc,
    presetKey: t.presetKey,
    stableKey: t.stableKey,
    fields: t.fields.map((f) => ({
      fieldKey: f.fieldKey,
      label: f.label,
      fieldType: f.fieldType,
      isRequired: f.isRequired,
      displaySequence: f.displaySequence,
      helpText: f.helpText,
      unitLabel: f.unitLabel,
      minNumber: f.minNumber,
      maxNumber: f.maxNumber,
      allowedSelections: f.allowedSelections,
      correctiveActionTrigger: f.correctiveActionTrigger,
      correctiveActionRequired: f.correctiveActionRequired,
    })),
    applicabilities: t.applicabilities.map((a) => ({
      kind: a.kind,
      assetId: a.assetId,
      assetType: a.assetType,
      spaceId: a.spaceId,
      spaceType: a.spaceType,
      unitId: a.unitId,
    })),
    schedules: t.schedules.map((s) => ({
      kind: s.kind,
      cycleStableKey: s.cycleStableKey,
      windowStartLocal: s.windowStartLocal,
      windowEndLocal: s.windowEndLocal,
    })),
  };
  const created = await createDraft(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    draft,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/templates");
  return { id: created.id };
}
