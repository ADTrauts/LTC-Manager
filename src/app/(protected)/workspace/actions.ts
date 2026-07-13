"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sessionUserIdForFk, getSession } from "@/lib/auth";
import {
  canAccessBusinessWorkspace,
  canCustomizeWorkspace,
  isWorkspaceSectionId,
  upsertWorkspacePreferenceState,
  type WorkspaceSectionId,
  WORKSPACE_OPTIONAL_SECTIONS,
} from "@/lib/business-workspace";

async function requireWorkspaceUser() {
  const session = await getSession();
  if (!session?.facilityId || !canAccessBusinessWorkspace(session.role)) {
    throw new Error("Unauthorized");
  }
  const userId = sessionUserIdForFk(session);
  if (!userId) {
    throw new Error("Workspace preferences require a user session");
  }
  return { session, userId, facilityId: session.facilityId };
}

const sectionIdSchema = z.string().refine(isWorkspaceSectionId, "Invalid section");

export async function updateWorkspaceHiddenSectionsAction(formData: FormData): Promise<void> {
  const { userId, facilityId, session } = await requireWorkspaceUser();
  if (!canCustomizeWorkspace(session.role)) {
    throw new Error("Role cannot customize Workspace");
  }

  const raw = formData.getAll("hiddenSectionId").map(String);
  const allowed = new Set<string>(WORKSPACE_OPTIONAL_SECTIONS);
  const hiddenSectionIds = raw.filter(
    (id): id is WorkspaceSectionId => isWorkspaceSectionId(id) && allowed.has(id),
  );

  await upsertWorkspacePreferenceState({
    userId,
    facilityId,
    patch: { hiddenSectionIds },
  });
  revalidatePath("/workspace");
}

export async function toggleWorkspaceSectionCollapsedAction(formData: FormData): Promise<void> {
  const { userId, facilityId } = await requireWorkspaceUser();
  const sectionId = sectionIdSchema.parse(String(formData.get("sectionId") ?? ""));
  const collapsed = String(formData.get("collapsed") ?? "") === "true";

  const { loadWorkspacePreferenceState } = await import(
    "@/lib/business-workspace/workspace-preferences"
  );
  const current = await loadWorkspacePreferenceState({ userId, facilityId });
  const set = new Set(current.collapsedSectionIds);
  if (collapsed) set.add(sectionId);
  else set.delete(sectionId);

  await upsertWorkspacePreferenceState({
    userId,
    facilityId,
    patch: { collapsedSectionIds: [...set] },
  });
  revalidatePath("/workspace");
}

export async function setWorkspacePreferredLandingAction(formData: FormData): Promise<void> {
  const { userId, facilityId, session } = await requireWorkspaceUser();
  if (!canCustomizeWorkspace(session.role)) {
    throw new Error("Role cannot customize Workspace");
  }
  const raw = String(formData.get("sectionId") ?? "");
  const preferredLandingSectionId =
    raw === "" || raw === "none"
      ? null
      : sectionIdSchema.parse(raw);

  await upsertWorkspacePreferenceState({
    userId,
    facilityId,
    patch: { preferredLandingSectionId },
  });
  revalidatePath("/workspace");
}

export async function setWorkspaceSectionOrderAction(formData: FormData): Promise<void> {
  const { userId, facilityId, session } = await requireWorkspaceUser();
  if (!canCustomizeWorkspace(session.role)) {
    throw new Error("Role cannot customize Workspace");
  }
  const raw = formData.getAll("sectionOrderId").map(String);
  const allowed = new Set<string>(WORKSPACE_OPTIONAL_SECTIONS);
  const sectionOrder = raw.filter(
    (id): id is WorkspaceSectionId => isWorkspaceSectionId(id) && allowed.has(id),
  );

  await upsertWorkspacePreferenceState({
    userId,
    facilityId,
    patch: { sectionOrder },
  });
  revalidatePath("/workspace");
}
