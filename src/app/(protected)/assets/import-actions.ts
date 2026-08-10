"use server";

import { revalidatePath } from "next/cache";

import { requireBulkImportAuthority } from "@/lib/bulk-import/authority";
import {
  ASSET_CSV_HEADERS,
  ASSET_CSV_TEMPLATE,
} from "@/lib/bulk-import/asset-import";
import {
  buildAssetImportPlanFromCsv,
  executeAssetImportPlan,
  loadAssetImportCatalog,
} from "@/lib/bulk-import/asset-import-execute";
import { buildValidationResultsCsv } from "@/lib/bulk-import/csv";
import type { BulkImportCompletionSummary } from "@/lib/bulk-import/types";
import { BULK_IMPORT_MAX_BYTES } from "@/lib/bulk-import/types";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

export type AssetImportPreviewResult = {
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
  summaryLines: string[];
  canConfirm: boolean;
  validationCsv: string;
  rowPreview: Array<{
    rowNumber: number;
    status: string;
    label: string;
    detail?: string;
  }>;
} | { ok: false; error: string };

function revalidateAssetViews() {
  revalidatePath("/assets");
  revalidatePath("/assets/builder");
  revalidatePath("/dashboard");
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

export async function getAssetImportTemplateAction(): Promise<string> {
  const session = await requireFacilitySession();
  requireBulkImportAuthority(session, "SUPERVISOR");
  return ASSET_CSV_TEMPLATE;
}

export async function previewAssetImportAction(
  formData: FormData,
): Promise<AssetImportPreviewResult> {
  const session = await requireFacilitySession();
  requireBulkImportAuthority(session, "SUPERVISOR");

  try {
    const { text, fileName } = await readCsvFromFormData(formData);
    const catalog = await loadAssetImportCatalog(prisma, session.facilityId);
    const built = buildAssetImportPlanFromCsv(text, catalog, fileName);
    if (!built.ok) return { ok: false, error: built.error };

    const plan = built.plan;
    const validationCsv = buildValidationResultsCsv({
      headers: [...ASSET_CSV_HEADERS],
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
      canConfirm: plan.canConfirm,
      validationCsv,
      summaryLines: [
        `${plan.createCount} assets will be created`,
        `${plan.skipCount} existing / duplicate rows will be skipped`,
        "Locations resolve by Floor → Neighborhood/Unit → Room/Space names (no UUIDs).",
        "Create-only: imports never retire, delete, or overwrite existing assets.",
      ],
      rowPreview: plan.rows.map((r) => ({
        rowNumber: r.rowNumber,
        status: r.status,
        label: r.name,
        detail:
          r.messages[0] ??
          r.errors[0]?.reason ??
          `${r.floorName} / ${r.neighborhoodName}${r.spaceName ? ` / ${r.spaceName}` : ""}`,
      })),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Validation failed.",
    };
  }
}

export async function confirmAssetImportAction(
  formData: FormData,
): Promise<BulkImportCompletionSummary> {
  const session = await requireFacilitySession();
  requireBulkImportAuthority(session, "SUPERVISOR");

  const { text, fileName } = await readCsvFromFormData(formData);
  const catalog = await loadAssetImportCatalog(prisma, session.facilityId);
  const built = buildAssetImportPlanFromCsv(text, catalog, fileName);
  if (!built.ok) {
    throw new Error(built.error);
  }
  if (!built.plan.canConfirm || built.plan.counts.invalidRows > 0) {
    throw new Error("Fix validation errors before confirming import.");
  }

  // Require department for every create row (or defaultable)
  for (const row of built.plan.rows) {
    if (row.action !== "create") continue;
    if (!row.departmentId) {
      // defaults resolved at execute time; if unit has none, execute throws
    }
  }

  const result = await executeAssetImportPlan(
    session,
    session.facilityId,
    built.plan,
    prisma,
  );

  revalidateAssetViews();

  return {
    importedBy: session.name || session.email || session.uid,
    importedAtIso: new Date().toISOString(),
    fileName,
    createdCount: result.createdCount,
    skippedCount: result.skippedCount,
    warningCount: built.plan.counts.warningRows,
    failedCount: 0,
    message: `Created ${result.createdCount} assets. Skipped ${result.skippedCount} existing/duplicate rows. No issues, repairs, or evidence were created.`,
  };
}
