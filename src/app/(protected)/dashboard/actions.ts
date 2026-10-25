"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { hasAtLeastRole } from "@/lib/access";
import { getOrGenerateMorningBrief } from "@/lib/ai";
import { isAiBriefEnabled } from "@/lib/feature-flags";
import { requireFacilitySession } from "@/lib/facility-context";
import { parseOperationalDepartmentKey } from "@/lib/department-admission";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { listEligibleCards } from "@/lib/dashboard/cards/eligibility";
import { resolveDepartmentDashboardCapabilities } from "@/lib/dashboard/capabilities";
import {
  layoutScopeAllowed,
  mergeLayoutForSave,
  parseDashboardLayoutItems,
} from "@/lib/dashboard/layouts/parse";
import {
  loadFacilityDashboardDefault,
  loadPersonalDashboardLayout,
  resetPersonalDashboardLayout,
  saveFacilityDashboardDefault,
  savePersonalDashboardLayout,
} from "@/lib/dashboard/layouts/store";
import {
  facilityDefaultBandLabel,
  facilityDefaultBands,
} from "@/lib/dashboard/layouts/facility-default";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { resolveDashboardViewer } from "@/lib/dashboard/viewer/resolve";
import type { DashboardAuthority, DashboardScopeKind, DashboardViewer } from "@/lib/dashboard/viewer/types";
import { getPartnerFacilitySession, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { MorningBriefView } from "@/lib/ai/types";

export type MorningBriefActionResult =
  | { ok: true; brief: MorningBriefView }
  | { ok: false; message: string };

function parseDepartmentKey(value: unknown): string | null {
  return parseOperationalDepartmentKey(value);
}

/** Manager+ may trigger provider generation / refresh. */
export async function refreshMorningBriefAction(input: {
  departmentKey?: string | null;
  forceRefresh?: boolean;
}): Promise<MorningBriefActionResult> {
  try {
    const session = await requireFacilitySession();
    if (!hasAtLeastRole(session.role, "MANAGER")) {
      return { ok: false, message: "Only managers can refresh the Morning Brief." };
    }
    if (!isAiBriefEnabled()) {
      return { ok: false, message: "Morning Brief AI is disabled." };
    }

    const brief = await getOrGenerateMorningBrief({
      facilityId: session.facilityId,
      departmentKey: parseDepartmentKey(input.departmentKey),
      allowProvider: true,
      forceRefresh: Boolean(input.forceRefresh),
    });

    return { ok: true, brief };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate Morning Brief.";
    return { ok: false, message };
  }
}

/** Non-blocking ensure: may call provider once when no READY cache exists. Manager+ only. */
export async function ensureMorningBriefAction(input: {
  departmentKey?: string | null;
}): Promise<MorningBriefActionResult> {
  return refreshMorningBriefAction({ ...input, forceRefresh: false });
}

export type DashboardLayoutActionResult = { ok: true; message: string } | { ok: false; message: string };

function scopeKindOf(value: FormDataEntryValue | null): DashboardScopeKind | null {
  if (value === "FACILITY" || value === "DEPARTMENT" || value === "TEAM") return value;
  return null;
}

async function layoutViewer(formData: FormData): Promise<
  | { ok: false; message: string }
  | { ok: true; viewer: DashboardViewer; scopeKind: DashboardScopeKind }
> {
  const session = (await getSession()) ?? (await getPartnerFacilitySession());
  if (!session?.facilityId) return { ok: false, message: "Sign in to arrange your Dashboard." };
  const scopeParam = String(formData.get("scope") ?? "");
  const cookieStore = await cookies();
  const resolution = await resolveDashboardViewer(session, {
    scopeParam,
    cookieDepartmentId: cookieStore.get(ACTIVE_DEPARTMENT_COOKIE)?.value,
  });
  if (resolution.kind !== "viewer" || !resolution.viewer.scope || !resolution.viewer.layoutOwner) {
    return { ok: false, message: "This Dashboard can't be arranged." };
  }
  if (!resolution.viewer.canCustomize) {
    return { ok: false, message: "This Dashboard can't be arranged." };
  }
  const scopeKind = scopeKindOf(formData.get("scopeKind"));
  if (
    !scopeKind ||
    scopeKind !== resolution.viewer.scope.kind ||
    !layoutScopeAllowed(resolution.viewer.availableScopes, scopeKind)
  ) {
    return { ok: false, message: "That Dashboard view can't be saved." };
  }
  return { ok: true, viewer: resolution.viewer, scopeKind };
}

export async function saveDashboardLayout(
  _prev: DashboardLayoutActionResult | null,
  formData: FormData,
): Promise<DashboardLayoutActionResult> {
  const ready = await layoutViewer(formData);
  if (!ready.ok) return ready;
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("items") ?? ""));
  } catch {
    return { ok: false, message: "The layout could not be read." };
  }
  const parsed = parseDashboardLayoutItems(raw);
  if (!parsed.ok) return { ok: false, message: parsed.reason };
  const owner = ready.viewer.layoutOwner;
  if (!owner) return { ok: false, message: "This Dashboard can't be arranged." };
  const capabilities = await resolveDepartmentDashboardCapabilities(ready.viewer);
  const eligible = new Set(listEligibleCards(ready.viewer, capabilities).map((card) => card.card.id));
  const stored =
    (await loadPersonalDashboardLayout(prisma, {
      facilityId: ready.viewer.facilityId,
      owner,
      scopeKind: ready.scopeKind,
    })) ?? [];
  await savePersonalDashboardLayout(prisma, {
    facilityId: ready.viewer.facilityId,
    owner,
    scopeKind: ready.scopeKind,
    items: mergeLayoutForSave(parsed.items, stored, eligible),
  });
  revalidatePath("/dashboard");
  revalidatePath("/partner");
  return { ok: true, message: "Dashboard saved." };
}

export async function resetDashboardLayout(
  _prev: DashboardLayoutActionResult | null,
  formData: FormData,
): Promise<DashboardLayoutActionResult> {
  const ready = await layoutViewer(formData);
  if (!ready.ok) return ready;
  const owner = ready.viewer.layoutOwner;
  if (!owner) return { ok: false, message: "This Dashboard can't be arranged." };
  await resetPersonalDashboardLayout(prisma, {
    facilityId: ready.viewer.facilityId,
    owner,
    scopeKind: ready.scopeKind,
  });
  revalidatePath("/dashboard");
  revalidatePath("/partner");
  return { ok: true, message: "Dashboard reset." };
}

function authorityOf(value: FormDataEntryValue | null): DashboardAuthority | null {
  if (
    value === "FACILITY_ADMINISTRATOR" ||
    value === "DEPARTMENT_LEADER" ||
    value === "MANAGER" ||
    value === "SUPERVISOR"
  ) {
    return value;
  }
  return null;
}

export async function setDashboardFacilityDefault(
  _prev: DashboardLayoutActionResult | null,
  formData: FormData,
): Promise<DashboardLayoutActionResult> {
  const ready = await layoutViewer(formData);
  if (!ready.ok) return ready;
  if (!isFacilityAdministratorRole(ready.viewer.role)) {
    return { ok: false, message: "Only a Facility Administrator can set a facility default." };
  }
  const authority = authorityOf(formData.get("authority"));
  if (!authority || !facilityDefaultBands(ready.scopeKind).includes(authority)) {
    return { ok: false, message: "That default isn't available for this view." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("items") ?? ""));
  } catch {
    return { ok: false, message: "The layout could not be read." };
  }
  const parsed = parseDashboardLayoutItems(raw);
  if (!parsed.ok) return { ok: false, message: parsed.reason };
  const capabilities = await resolveDepartmentDashboardCapabilities(ready.viewer);
  const eligible = new Set(listEligibleCards(ready.viewer, capabilities).map((card) => card.card.id));
  const stored =
    (await loadFacilityDashboardDefault(prisma, {
      facilityId: ready.viewer.facilityId,
      authority,
      scopeKind: ready.scopeKind,
    })) ?? [];
  await saveFacilityDashboardDefault(prisma, {
    facilityId: ready.viewer.facilityId,
    authority,
    scopeKind: ready.scopeKind,
    items: mergeLayoutForSave(parsed.items, stored, eligible),
  });
  revalidatePath("/dashboard");
  return { ok: true, message: `Default saved for ${facilityDefaultBandLabel(authority)}.` };
}
