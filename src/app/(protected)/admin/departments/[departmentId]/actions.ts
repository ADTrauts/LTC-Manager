"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AppRole } from "@/lib/access";
import {
  activateProfile,
  addRoomExperienceException,
  certifyProfile,
  clearRoomArchetypeBinding,
  createBaselineDraft,
  createNextDraftVersion,
  createRoomArchetype,
  ensureWorkingDraftForPatterns,
  loadProfile,
  toProfileSnapshot,
  moveAreaExperience,
  removeRoomExperienceException,
  reorderAreaExperiences,
  retireActiveProfile,
  setAreaExperienceActive,
  setArchetypeExperiences,
  updateRoomArchetype,
  type ProfileActor,
} from "@/lib/department-administration/profile-service";
import { departmentArchetypeForRoomType } from "@/lib/department-administration/room-types";
import type { AuthMethod } from "@/lib/auth";
import { requireFacilitySession } from "@/lib/facility-context";
import { isDepartmentOperationalProfilesEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

function actorFromSession(session: {
  uid: string;
  role: string;
  facilityId: string;
  authMethod?: AuthMethod;
}): ProfileActor {
  return {
    userId: session.uid,
    role: session.role as AppRole,
    facilityId: session.facilityId,
    authMethod: session.authMethod ?? "PASSWORD",
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
      message: `Draft version ${result.version} created.`,
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

export async function createOperationalTypeAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const name = z.string().min(1).max(120).parse(String(formData.get("name") ?? "").trim());
    const description = z
      .string()
      .max(500)
      .optional()
      .parse(String(formData.get("description") ?? "").trim() || undefined);
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const draft = await ensureWorkingDraftForPatterns(actorFromSession(session), {
      facilityId: session.facilityId,
      departmentId,
    });
    await createRoomArchetype(actorFromSession(session), {
      profileId: draft.profileId,
      name,
      description: description ?? null,
    });
    revalidateDepartmentAdmin(departmentId);
    return {
      ok: true,
      message: `Operational type “${name}” created.`,
      profileId: draft.profileId,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not create operational type.",
    };
  }
}

export async function ensurePatternDraftAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const draft = await ensureWorkingDraftForPatterns(actorFromSession(session), {
      facilityId: session.facilityId,
      departmentId,
    });
    revalidateDepartmentAdmin(departmentId);
    return {
      ok: true,
      message: draft.created
        ? "Draft operational configuration created."
        : "Draft operational configuration is ready.",
      profileId: draft.profileId,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not prepare operational types.",
    };
  }
}

const ROLE_BINDING_RETIRED =
  "Role bindings are retired. Program the room from Teams (membership + cycle need).";

export async function bindRoomsToOperationalTypeAction(
  _formData: FormData,
): Promise<ActionResult> {
  return { ok: false, message: ROLE_BINDING_RETIRED };
}

export async function clearRoomOperationalTypeAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const unitSpaceId = z.string().cuid().parse(formData.get("unitSpaceId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const actor = actorFromSession(session);
    const draft = await ensureWorkingDraftForPatterns(actor, {
      facilityId: session.facilityId,
      departmentId,
    });
    await clearRoomArchetypeBinding(actor, {
      profileId: draft.profileId,
      unitSpaceId,
    });
    revalidateDepartmentAdmin(departmentId);
    return { ok: true, message: "Operational type removed. Location remains assigned." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not remove operational type.",
    };
  }
}

export async function renameOperationalTypeAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const archetypeKey = z.string().min(1).max(64).parse(String(formData.get("archetypeKey") ?? "").trim());
    const name = z.string().min(1).max(120).parse(String(formData.get("name") ?? "").trim());
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const actor = actorFromSession(session);
    const draft = await ensureWorkingDraftForPatterns(actor, {
      facilityId: session.facilityId,
      departmentId,
    });
    const loaded = await loadProfile(draft.profileId);
    const archetype = loaded.archetypes.find((row) => row.key === archetypeKey);
    if (!archetype) {
      throw new Error("That operational type was not found on the draft.");
    }
    await updateRoomArchetype(actor, {
      profileId: draft.profileId,
      archetypeId: archetype.id,
      name,
    });
    revalidateDepartmentAdmin(departmentId);
    return { ok: true, message: `Operational type renamed to “${name}”.`, profileId: draft.profileId };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not rename operational type.",
    };
  }
}

export async function updateRoomTypeDepartmentUseAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const roomTypeKey = z.string().min(1).max(120).parse(String(formData.get("roomTypeKey") ?? "").trim());
    const description = z
      .string()
      .max(1000)
      .parse(String(formData.get("description") ?? "").trim());
    const department = await assertDepartmentInFacility(departmentId, session.facilityId);
    if (roomTypeKey.startsWith("custom:")) {
      throw new Error("Reusable configuration is not available for custom Room Types yet.");
    }
    const actor = actorFromSession(session);
    const draft = await ensureWorkingDraftForPatterns(actor, {
      facilityId: session.facilityId,
      departmentId,
    });
    const loaded = await loadProfile(draft.profileId);
    const snapshot = toProfileSnapshot(loaded);
    const archetype = departmentArchetypeForRoomType({
      departmentKey: department.key,
      roomTypeKey,
      profile: snapshot,
    });
    if (!archetype) {
      throw new Error("Set up department configuration for this Room Type first.");
    }
    await updateRoomArchetype(actor, {
      profileId: draft.profileId,
      archetypeId: archetype.id,
      description,
    });
    revalidateDepartmentAdmin(departmentId);
    return {
      ok: true,
      message: "About this Room Type saved.",
      profileId: draft.profileId,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save department use.",
    };
  }
}

export async function setRoomTypeExperiencesAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const roomTypeKey = z.string().min(1).max(120).parse(String(formData.get("roomTypeKey") ?? "").trim());
    const selectedRaw = String(formData.get("selectedIds") ?? "");
    const selectedIds = selectedRaw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    z.array(z.string().cuid()).parse(selectedIds);
    const department = await assertDepartmentInFacility(departmentId, session.facilityId);
    if (roomTypeKey.startsWith("custom:")) {
      throw new Error("Reusable configuration is not available for custom Room Types yet.");
    }
    const actor = actorFromSession(session);
    const draft = await ensureWorkingDraftForPatterns(actor, {
      facilityId: session.facilityId,
      departmentId,
    });
    const loaded = await loadProfile(draft.profileId);
    const snapshot = toProfileSnapshot(loaded);
    const archetype = departmentArchetypeForRoomType({
      departmentKey: department.key,
      roomTypeKey,
      profile: snapshot,
    });
    if (!archetype) {
      throw new Error("Set up department configuration for this Room Type first.");
    }
    await setArchetypeExperiences(actor, {
      profileId: draft.profileId,
      archetypeId: archetype.id,
      selections: selectedIds.map((areaExperienceId) => ({ areaExperienceId })),
    });
    revalidateDepartmentAdmin(departmentId);
    return {
      ok: true,
      message: "Department configuration saved.",
      profileId: draft.profileId,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save configuration.",
    };
  }
}

export async function createArchetypeAction(formData: FormData): Promise<ActionResult> {
  try {
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
    return { ok: true, message: "Department configuration saved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Update failed." };
  }
}

export async function bindRoomAction(_formData: FormData): Promise<ActionResult> {
  return { ok: false, message: ROLE_BINDING_RETIRED };
}

export async function clearRoomBindingAction(formData: FormData): Promise<ActionResult> {
  try {
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

/**
 * Locations programming — Operational Type assign/clear/create.
 * Uses pattern authoring access (password Manager+). Does not require the
 * full Operational Profiles flag.
 */
export async function ensureLocationOperationalTypesAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const draft = await ensureWorkingDraftForPatterns(actorFromSession(session), {
      facilityId: session.facilityId,
      departmentId,
    });
    revalidateDepartmentAdmin(departmentId);
    return {
      ok: true,
      message: "Operational Types are ready to assign.",
      profileId: draft.profileId,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not prepare Operational Types.",
    };
  }
}

export async function assignLocationOperationalTypeAction(
  _formData: FormData,
): Promise<ActionResult> {
  return { ok: false, message: ROLE_BINDING_RETIRED };
}

export async function clearLocationOperationalTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const unitSpaceId = z.string().cuid().parse(formData.get("unitSpaceId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const actor = actorFromSession(session);
    const draft = await ensureWorkingDraftForPatterns(actor, {
      facilityId: session.facilityId,
      departmentId,
    });
    await clearRoomArchetypeBinding(actor, {
      profileId: draft.profileId,
      unitSpaceId,
    });
    revalidateDepartmentAdmin(departmentId);
    return { ok: true, message: "Operational Type cleared.", profileId: draft.profileId };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not clear Operational Type.",
    };
  }
}

export async function createLocationOperationalTypeAction(
  _formData: FormData,
): Promise<ActionResult> {
  return { ok: false, message: ROLE_BINDING_RETIRED };
}
