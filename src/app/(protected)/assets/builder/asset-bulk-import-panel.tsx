"use client";

import { useRouter } from "next/navigation";

import {
  BulkImportWizard,
  type BulkImportPreviewModel,
} from "@/components/build/bulk-import-wizard";
import { ASSET_CSV_TEMPLATE } from "@/lib/bulk-import/asset-import";
import type { BulkImportCompletionSummary } from "@/lib/bulk-import/types";

import {
  confirmAssetImportAction,
  previewAssetImportAction,
} from "../import-actions";

type Props = {
  onClose?: () => void;
};

export function AssetBulkImportPanel({ onClose }: Props) {
  const router = useRouter();

  async function onPreview(file: File): Promise<BulkImportPreviewModel> {
    const fd = new FormData();
    fd.set("file", file);
    const result = await previewAssetImportAction(fd);
    if (!result.ok) throw new Error(result.error);
    return {
      counts: result.counts,
      issues: result.issues.map((i) => ({
        row: i.row,
        status: i.status as BulkImportPreviewModel["issues"][number]["status"],
        message: i.message,
        field: i.field,
        value: i.value,
        suggestion: i.suggestion,
      })),
      canConfirm: result.canConfirm,
      summaryLines: result.summaryLines,
      rowPreview: result.rowPreview,
      validationCsv: result.validationCsv,
    };
  }

  async function onConfirm(file: File): Promise<BulkImportCompletionSummary> {
    const fd = new FormData();
    fd.set("file", file);
    const summary = await confirmAssetImportAction(fd);
    router.refresh();
    return summary;
  }

  return (
    <BulkImportWizard
      title="Bulk Import — Assets"
      description="Create equipment inventory from a CSV. Locations match the Facility Builder hierarchy by name."
      templateFileName="ltc-asset-import-template.csv"
      templateCsv={ASSET_CSV_TEMPLATE}
      testIdPrefix="asset-bulk-import"
      onPreview={onPreview}
      onConfirm={onConfirm}
      onClose={onClose}
      instructions={
        <>
          <p className="font-medium text-zinc-900">Import instructions</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Required: <code>name</code>, <code>equipmentType</code>,{" "}
              <code>floor</code>, <code>neighborhood</code>
            </li>
            <li>
              Optional location: <code>space</code> (Room/Space under the neighborhood)
            </li>
            <li>
              Optional identity: <code>assetCode</code>, <code>serialNumber</code>,{" "}
              <code>facilityAssetNumber</code>, manufacturer/model, status, department,
              criticality, notes
            </li>
            <li>
              Exact asset code / facility asset number / serial matches are skipped by
              default. Conflicts never overwrite.
            </li>
            <li>
              Does not create repairs, issues, evidence, or retire existing assets.
            </li>
            <li>CSV only. Max 2,000 rows / 2 MB. Import facility structure first.</li>
          </ul>
        </>
      }
    />
  );
}
