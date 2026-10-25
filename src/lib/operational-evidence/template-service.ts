import type { FacilitySession } from "@/lib/auth";

import { resolveEvidenceAuthority } from "./evidence-authority";
import { isOperationalEvidencePresetKey } from "./template-presets";
import type { TemplateDraftInput } from "./types";

export type EvidenceActor = {
  userId: string | null;
  label?: string | null;
};

const RETIRED = "Operational templates are retired. Records use Catalog definitions.";

export async function createDraft(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    draft: TemplateDraftInput;
    actor: EvidenceActor;
    client?: unknown;
  },
): Promise<never> {
  throw new Error(RETIRED);
}

export async function updateDraft(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    templateId: string;
    draft: TemplateDraftInput;
    actor: EvidenceActor;
    client?: unknown;
  },
): Promise<never> {
  throw new Error(RETIRED);
}

export async function publishTemplate(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    templateId: string;
    actor: EvidenceActor;
    client?: unknown;
  },
): Promise<never> {
  throw new Error(RETIRED);
}

export async function retireTemplate(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    templateId: string;
    actor: EvidenceActor;
    client?: unknown;
  },
): Promise<never> {
  throw new Error(RETIRED);
}

export async function createDraftFromPreset(
  _session: FacilitySession,
  input: {
    facilityId: string;
    departmentId: string;
    presetKey: string;
    actor: EvidenceActor;
    client?: unknown;
  },
): Promise<never> {
  if (!isOperationalEvidencePresetKey(input.presetKey)) {
    throw new Error(`Unknown template preset "${input.presetKey}".`);
  }
  throw new Error(RETIRED);
}

export async function loadBuilderTemplates(input: {
  session: FacilitySession;
  facilityId: string;
  departmentId: string;
}) {
  const authority = await resolveEvidenceAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewDepartment && !authority.canManage) {
    throw new Error(authority.reason ?? "Insufficient Operational Evidence authority.");
  }
  return {
    templates: [] as never[],
    canManage: authority.canManage,
    canPublish: authority.canPublish,
  };
}

export async function loadTemplateDetail(input: {
  session: FacilitySession;
  facilityId: string;
  departmentId: string;
  templateId: string;
}) {
  const authority = await resolveEvidenceAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewDepartment && !authority.canManage) {
    throw new Error(authority.reason ?? "Insufficient Operational Evidence authority.");
  }
  void input.templateId;
  throw new Error("Template not found.");
}
