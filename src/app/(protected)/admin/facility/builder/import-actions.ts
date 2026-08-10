"use server";

import { revalidatePath } from "next/cache";

import { requireBulkImportAuthority } from "@/lib/bulk-import/authority";
import { buildValidationResultsCsv } from "@/lib/bulk-import/csv";
import {
  FACILITY_STRUCTURE_CSV_HEADERS,
  FACILITY_STRUCTURE_CSV_TEMPLATE,
} from "@/lib/bulk-import/facility-structure";
import {
  buildFacilityStructurePlanFromCsv,
  executeFacilityStructurePlan,
  loadFacilityStructureCatalog,
} from "@/lib/bulk-import/facility-structure-execute";
import type { BulkImportCompletionSummary } from "@/lib/bulk-import/types";
import { BULK_IMPORT_MAX_BYTES } from "@/lib/bulk-import/types";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

export type FacilityStructurePreviewResult = {
  ok: true;
  counts: {
    totalRows: number;
    validRows: number;
    warningRows: number;
    invalidRows: number;
    createCount: number;
    reuseCount: number;
    skipCount: number;
    conflictCount: number;
  };
  issues: Array<{
    row: number;
    status: string;
    message: string;
    field?: string;
    value?: string;
    suggestion?: string;
  }>;
  hierarchyPreview: Array<{
    name: string;
    action: "create" | "reuse";
    neighborhoods: Array<{
      name: string;
      action: "create" | "reuse";
      spaceCounts: Record<string, number>;
      spaceTotal: number;
    }>;
  }>;
  summaryLines: string[];
  canConfirm: boolean;
  validationCsv: string;
  rowPreview: Array<{
    rowNumber: number;
    status: string;
    label: string;
    detail?: string;
  }>;
  floorsToCreate: number;
  neighborhoodsToCreate: number;
  spacesToCreate: number;
} | { ok: false; error: string };

function revalidateBuilderViews() {
  revalidatePath("/admin/facility/builder");
  revalidatePath("/units");
  revalidatePath("/dashboard");
  revalidatePath("/unit/[unitId]", "page");
}

async function readCsvFromFormData(formData: FormData): Promise<{
  text: string;
  fileName: string | null;
}> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Choose a CSV file.");
  }
  if (file.size > BULK_IMPORT_MAX_BYTES) {
    throw new Error("File is too large (max 2 MB).");
  }
  const text = await file.text();
  if (text.length > BULK_IMPORT_MAX_BYTES) {
    throw new Error("File is too large (max 2 MB).");
  }
  return { text, fileName: file.name || null };
}

export async function getFacilityStructureTemplateAction(): Promise<string> {
  const session = await requireFacilitySession();
  requireBulkImportAuthority(session, "MANAGER");
  return FACILITY_STRUCTURE_CSV_TEMPLATE;
}

export async function previewFacilityStructureImportAction(
  formData: FormData,
): Promise<FacilityStructurePreviewResult> {
  const session = await requireFacilitySession();
  requireBulkImportAuthority(session, "MANAGER");

  try {
    const { text, fileName } = await readCsvFromFormData(formData);
    const catalog = await loadFacilityStructureCatalog(prisma, session.facilityId);
    const built = buildFacilityStructurePlanFromCsv(text, catalog, fileName);
    if (!built.ok) return { ok: false, error: built.error };

    const plan = built.plan;
    const validationCsv = buildValidationResultsCsv({
      headers: [...FACILITY_STRUCTURE_CSV_HEADERS],
      rows: plan.rows.map((r) => ({
        rowNumber: r.rowNumber,
        status: r.status,
        message:
          r.errors[0]?.reason ??
          r.messages[0] ??
          (r.status === "create" ? "Will create" : r.status),
        cells: r.cells,
      })),
    });

    return {
      ok: true,
      counts: plan.counts,
      issues: plan.issues,
      hierarchyPreview: plan.hierarchyPreview,
      canConfirm: plan.canConfirm,
      validationCsv,
      floorsToCreate: plan.floorsToCreate,
      neighborhoodsToCreate: plan.neighborhoodsToCreate,
      spacesToCreate: plan.spacesToCreate,
      summaryLines: [
        `${plan.floorsToCreate} Floors to create · ${plan.floorsReused} reused`,
        `${plan.neighborhoodsToCreate} Neighborhoods/Units to create · ${plan.neighborhoodsReused} reused`,
        `${plan.spacesToCreate} Rooms/Spaces to create · ${plan.spacesReused} reused`,
        "Create-only: imports never delete, retire, rename, or move existing hierarchy.",
      ],
      rowPreview: plan.rows.map((r) => ({
        rowNumber: r.rowNumber,
        status: r.status,
        label: `${r.floorName} / ${r.neighborhoodName} / ${r.spaceName}`,
        detail: r.messages[0] ?? r.errors[0]?.reason,
      })),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Validation failed.",
    };
  }
}

export async function confirmFacilityStructureImportAction(
  formData: FormData,
): Promise<BulkImportCompletionSummary> {
  const session = await requireFacilitySession();
  requireBulkImportAuthority(session, "MANAGER");

  const { text, fileName } = await readCsvFromFormData(formData);
  const catalog = await loadFacilityStructureCatalog(prisma, session.facilityId);
  const built = buildFacilityStructurePlanFromCsv(text, catalog, fileName);
  if (!built.ok) {
    throw new Error(built.error);
  }
  if (!built.plan.canConfirm || built.plan.counts.invalidRows > 0) {
    throw new Error("Fix validation errors before confirming import.");
  }

  const result = await executeFacilityStructurePlan(
    prisma,
    session.facilityId,
    built.plan,
  );

  revalidateBuilderViews();

  const createdCount =
    result.floorsCreated + result.neighborhoodsCreated + result.spacesCreated;
  const skippedCount =
    result.floorsReused + result.neighborhoodsReused + result.spacesReused;

  return {
    importedBy: session.name || session.email || session.uid,
    importedAtIso: new Date().toISOString(),
    fileName,
    createdCount,
    skippedCount,
    warningCount: built.plan.counts.warningRows,
    failedCount: 0,
    message: `Created ${result.floorsCreated} floors, ${result.neighborhoodsCreated} neighborhoods, ${result.spacesCreated} spaces. Reused ${skippedCount} existing hierarchy nodes.`,
  };
}
