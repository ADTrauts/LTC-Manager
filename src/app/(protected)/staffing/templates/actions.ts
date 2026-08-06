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
