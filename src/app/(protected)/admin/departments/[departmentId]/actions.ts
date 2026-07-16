"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AppRole } from "@/lib/access";
import {
  activateProfile,
  addRoomExperienceException,
  bindRoomToArchetype,
  certifyProfile,
  clearRoomArchetypeBinding,
  createBaselineDraft,
  createNextDraftVersion,
  createRoomArchetype,
  moveAreaExperience,
  removeRoomExperienceException,
  reorderAreaExperiences,
  retireActiveProfile,
  setAreaExperienceActive,
  setArchetypeExperiences,
  updateRoomArchetype,
  type ProfileActor,
} from "@/lib/department-administration";
import { requireFacilitySession } from "@/lib/facility-context";
import { isDepartmentOperationalProfilesEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

function actorFromSession(session: {
  uid: string;
  role: string;
  facilityId: string;
}): ProfileActor {
  return {
    userId: session.uid,
    role: session.role as AppRole,
    facilityId: session.facilityId,
  };
}

function revalidateDepartmentAdmin(departmentId: string) {
  revalidatePath(`/admin/departments/${departmentId}`);
  revalidatePath("/admin/departments");
}

async function assertDepartmentInFacility(
  departmentId: string,
  facilityId: string,
): Promise<{ id: string; key: string }> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true, key: true },
  });
  if (!department) throw new Error("Department not found.");
  return department;
}

async function assertProfileInFacility(
  profileId: string,
  facilityId: string,
): Promise<{ id: string; departmentId: string }> {
  const profile = await prisma.departmentOperationalProfile.findFirst({
    where: { id: profileId, facilityId },
    select: { id: true, departmentId: true },
  });
  if (!profile) throw new Error("Profile not found.");
  return profile;
}

function requireFeature(): void {
  if (!isDepartmentOperationalProfilesEnabled()) {
    throw new Error("Department Operational Profiles are not enabled.");
  }
}

export type ActionResult =
  | { ok: true; message?: string; profileId?: string }
  | { ok: false; message: string; errors?: string[] };

export async function createBaselineDraftAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const result = await createBaselineDraft(actorFromSession(session), {
      facilityId: session.facilityId,
      departmentId,
    });
    revalidateDepartmentAdmin(departmentId);
    return {
      ok: true,
      message: `Draft version ${result.version} created from baseline.`,
      profileId: result.profileId,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Failed to create draft." };
  }
}

export async function createNextDraftAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    const result = await createNextDraftVersion(actorFromSession(session), profileId);
    revalidateDepartmentAdmin(profile.departmentId);
    return {
      ok: true,
      message: `Draft version ${result.version} created.`,
      profileId: result.profileId,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Failed to create draft." };
  }
}

export async function certifyProfileAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    const result = await certifyProfile(actorFromSession(session), profileId);
    revalidateDepartmentAdmin(profile.departmentId);
    if (!result.certifiable) {
      return {
        ok: false,
        message: "Profile is not ready to certify.",
        errors: result.errors.map((e) => e.message),
      };
    }
    return { ok: true, message: "Profile certified.", profileId };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Certification failed." };
  }
}

export async function activateProfileAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await activateProfile(actorFromSession(session), profileId);
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Profile activated.", profileId };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Activation failed." };
  }
}

export async function retireProfileAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await retireActiveProfile(actorFromSession(session), profileId);
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Profile retired.", profileId };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Retire failed." };
  }
}

export async function setExperienceActiveAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const areaExperienceId = z.string().cuid().parse(formData.get("areaExperienceId"));
    const isActive = formData.get("isActive") === "true";
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await setAreaExperienceActive(actorFromSession(session), {
      profileId,
      areaExperienceId,
      isActive,
    });
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: isActive ? "Experience enabled." : "Experience disabled." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Update failed." };
  }
}

export async function moveExperienceAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const areaExperienceId = z.string().cuid().parse(formData.get("areaExperienceId"));
    const targetAreaId = z.string().cuid().parse(formData.get("targetAreaId"));
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await moveAreaExperience(actorFromSession(session), {
      profileId,
      areaExperienceId,
      targetAreaId,
    });
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Experience moved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Move failed." };
  }
}

export async function reorderExperiencesAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const areaId = z.string().cuid().parse(formData.get("areaId"));
    const orderedRaw = String(formData.get("orderedIds") ?? "");
    const orderedAreaExperienceIds = orderedRaw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    z.array(z.string().cuid()).min(1).parse(orderedAreaExperienceIds);
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await reorderAreaExperiences(actorFromSession(session), {
      profileId,
      areaId,
      orderedAreaExperienceIds,
    });
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Order updated." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Reorder failed." };
  }
}

export async function createArchetypeAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const key = z.string().min(1).max(64).parse(formData.get("key"));
    const name = z.string().min(1).max(120).parse(formData.get("name"));
    const description = z.string().max(500).optional().parse(formData.get("description") || undefined);
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    const result = await createRoomArchetype(actorFromSession(session), {
      profileId,
      key,
      name,
      description: description ?? null,
    });
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Archetype created.", profileId: result.archetypeId };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Create failed." };
  }
}

export async function updateArchetypeAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const archetypeId = z.string().cuid().parse(formData.get("archetypeId"));
    const name = formData.get("name");
    const description = formData.get("description");
    const isActiveRaw = formData.get("isActive");
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await updateRoomArchetype(actorFromSession(session), {
      profileId,
      archetypeId,
      name: typeof name === "string" && name.length > 0 ? name : undefined,
      description:
        description === null || description === undefined
          ? undefined
          : String(description),
      isActive:
        isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : undefined,
    });
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Archetype updated." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Update failed." };
  }
}

export async function setArchetypeExperiencesAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const archetypeId = z.string().cuid().parse(formData.get("archetypeId"));
    const selectedRaw = String(formData.get("selectedIds") ?? "");
    const selectedIds = selectedRaw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    z.array(z.string().cuid()).parse(selectedIds);
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await setArchetypeExperiences(actorFromSession(session), {
      profileId,
      archetypeId,
      selections: selectedIds.map((areaExperienceId) => ({ areaExperienceId })),
    });
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Archetype Experiences updated." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Update failed." };
  }
}

export async function bindRoomAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const archetypeId = z.string().cuid().parse(formData.get("archetypeId"));
    const unitSpaceId = z.string().cuid().parse(formData.get("unitSpaceId"));
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await bindRoomToArchetype(actorFromSession(session), {
      profileId,
      archetypeId,
      unitSpaceId,
    });
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Room mapped." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Mapping failed." };
  }
}

export async function clearRoomBindingAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const unitSpaceId = z.string().cuid().parse(formData.get("unitSpaceId"));
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await clearRoomArchetypeBinding(actorFromSession(session), {
      profileId,
      unitSpaceId,
    });
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Room mapping cleared." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Clear failed." };
  }
}

export async function upsertRoomExceptionAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const unitSpaceId = z.string().cuid().parse(formData.get("unitSpaceId"));
    const areaExperienceId = z.string().cuid().parse(formData.get("areaExperienceId"));
    const mode = z.enum(["ENABLE", "DISABLE", "OVERRIDE"]).parse(formData.get("mode"));
    const reason = z.string().max(500).optional().parse(formData.get("reason") || undefined);
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await addRoomExperienceException(actorFromSession(session), {
      profileId,
      unitSpaceId,
      areaExperienceId,
      mode,
      reason: reason ?? null,
    });
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Exception saved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Exception failed." };
  }
}

export async function removeRoomExceptionAction(formData: FormData): Promise<ActionResult> {
  try {
    requireFeature();
    const session = await requireFacilitySession();
    const profileId = z.string().cuid().parse(formData.get("profileId"));
    const exceptionId = z.string().cuid().parse(formData.get("exceptionId"));
    const profile = await assertProfileInFacility(profileId, session.facilityId);
    await removeRoomExperienceException(actorFromSession(session), {
      profileId,
      exceptionId,
    });
    revalidateDepartmentAdmin(profile.departmentId);
    return { ok: true, message: "Exception removed." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Remove failed." };
  }
}
