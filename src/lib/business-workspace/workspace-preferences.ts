import { prisma } from "@/lib/prisma";

import type { WorkspacePreferenceState, WorkspaceSectionId } from "./types";
import {
  WORKSPACE_OPTIONAL_SECTIONS,
  WORKSPACE_REQUIRED_SECTIONS,
  canCustomizeWorkspace,
  resolveCustomizableSections,
  resolveWorkspaceSections,
} from "./workspace-permissions";

const ALL_SECTION_IDS = new Set<string>([
  ...WORKSPACE_REQUIRED_SECTIONS,
  ...WORKSPACE_OPTIONAL_SECTIONS,
]);

export function isWorkspaceSectionId(value: string): value is WorkspaceSectionId {
  return ALL_SECTION_IDS.has(value);
}

export function emptyWorkspacePreferenceState(): WorkspacePreferenceState {
  return {
    hiddenSectionIds: [],
    collapsedSectionIds: [],
    sectionOrder: [],
    preferredLandingSectionId: null,
  };
}

function sanitizeSectionIds(values: readonly string[]): WorkspaceSectionId[] {
  const out: WorkspaceSectionId[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isWorkspaceSectionId(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function parseWorkspacePreferenceRow(row: {
  hiddenSectionIds: string[];
  collapsedSectionIds: string[];
  sectionOrder: string[];
  preferredLandingSectionId: string | null;
} | null): WorkspacePreferenceState {
  if (!row) return emptyWorkspacePreferenceState();
  const preferred = row.preferredLandingSectionId;
  return {
    hiddenSectionIds: sanitizeSectionIds(row.hiddenSectionIds),
    collapsedSectionIds: sanitizeSectionIds(row.collapsedSectionIds),
    sectionOrder: sanitizeSectionIds(row.sectionOrder),
    preferredLandingSectionId:
      preferred && isWorkspaceSectionId(preferred) ? preferred : null,
  };
}

/**
 * Apply facility-scoped preferences on top of role baselines.
 * Preferences never unlock sections the role cannot see.
 * Required sections for the role cannot be hidden.
 */
export function applyWorkspacePreferences(input: {
  role: import("@/lib/access").AppRole;
  preferences: WorkspacePreferenceState;
}): {
  visibleSections: WorkspaceSectionId[];
  collapsedSections: WorkspaceSectionId[];
  preferredLandingSectionId: WorkspaceSectionId | null;
  customizableSections: WorkspaceSectionId[];
  canCustomize: boolean;
  sectionOrder: WorkspaceSectionId[];
} {
  const baseline = resolveWorkspaceSections(input.role);
  const customizable = resolveCustomizableSections(input.role);
  const customizableSet = new Set(customizable);
  const baselineSet = new Set(baseline);

  const hidden = new Set(
    input.preferences.hiddenSectionIds.filter((id) => customizableSet.has(id)),
  );

  const visibleSections = baseline.filter((id) => !hidden.has(id));

  const collapsedSections = input.preferences.collapsedSectionIds.filter((id) =>
    visibleSections.includes(id),
  );

  const preferred =
    input.preferences.preferredLandingSectionId &&
    visibleSections.includes(input.preferences.preferredLandingSectionId)
      ? input.preferences.preferredLandingSectionId
      : null;

  void baselineSet;

  return {
    visibleSections,
    collapsedSections,
    preferredLandingSectionId: preferred,
    customizableSections: customizable,
    canCustomize: canCustomizeWorkspace(input.role),
    sectionOrder: input.preferences.sectionOrder.filter((id) => visibleSections.includes(id)),
  };
}

export async function loadWorkspacePreferenceState(input: {
  userId: string;
  facilityId: string;
}): Promise<WorkspacePreferenceState> {
  const row = await prisma.workspacePreference.findUnique({
    where: {
      userId_facilityId: {
        userId: input.userId,
        facilityId: input.facilityId,
      },
    },
    select: {
      hiddenSectionIds: true,
      collapsedSectionIds: true,
      sectionOrder: true,
      preferredLandingSectionId: true,
    },
  });
  return parseWorkspacePreferenceRow(row);
}

export async function upsertWorkspacePreferenceState(input: {
  userId: string;
  facilityId: string;
  patch: Partial<WorkspacePreferenceState>;
}): Promise<WorkspacePreferenceState> {
  const current = await loadWorkspacePreferenceState({
    userId: input.userId,
    facilityId: input.facilityId,
  });

  const next: WorkspacePreferenceState = {
    hiddenSectionIds: input.patch.hiddenSectionIds
      ? sanitizeSectionIds(input.patch.hiddenSectionIds)
      : current.hiddenSectionIds,
    collapsedSectionIds: input.patch.collapsedSectionIds
      ? sanitizeSectionIds(input.patch.collapsedSectionIds)
      : current.collapsedSectionIds,
    sectionOrder: input.patch.sectionOrder
      ? sanitizeSectionIds(input.patch.sectionOrder)
      : current.sectionOrder,
    preferredLandingSectionId:
      input.patch.preferredLandingSectionId === undefined
        ? current.preferredLandingSectionId
        : input.patch.preferredLandingSectionId &&
            isWorkspaceSectionId(input.patch.preferredLandingSectionId)
          ? input.patch.preferredLandingSectionId
          : null,
  };

  const row = await prisma.workspacePreference.upsert({
    where: {
      userId_facilityId: {
        userId: input.userId,
        facilityId: input.facilityId,
      },
    },
    create: {
      userId: input.userId,
      facilityId: input.facilityId,
      hiddenSectionIds: next.hiddenSectionIds,
      collapsedSectionIds: next.collapsedSectionIds,
      sectionOrder: next.sectionOrder,
      preferredLandingSectionId: next.preferredLandingSectionId,
    },
    update: {
      hiddenSectionIds: next.hiddenSectionIds,
      collapsedSectionIds: next.collapsedSectionIds,
      sectionOrder: next.sectionOrder,
      preferredLandingSectionId: next.preferredLandingSectionId,
    },
    select: {
      hiddenSectionIds: true,
      collapsedSectionIds: true,
      sectionOrder: true,
      preferredLandingSectionId: true,
    },
  });

  return parseWorkspacePreferenceRow(row);
}
