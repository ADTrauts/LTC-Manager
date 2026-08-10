"use client";

import { useRouter } from "next/navigation";

import {
  BulkImportWizard,
  type BulkImportPreviewModel,
} from "@/components/build/bulk-import-wizard";
import { FACILITY_STRUCTURE_CSV_TEMPLATE } from "@/lib/bulk-import/facility-structure";
import type { BulkImportCompletionSummary } from "@/lib/bulk-import/types";

import {
  confirmFacilityStructureImportAction,
  previewFacilityStructureImportAction,
} from "./import-actions";

type Props = {
  onClose: () => void;
  onImported?: () => void;
};

export function FacilityBulkImportPanel({ onClose, onImported }: Props) {
  const router = useRouter();

  async function onPreview(file: File): Promise<BulkImportPreviewModel> {
    const fd = new FormData();
    fd.set("file", file);
    const result = await previewFacilityStructureImportAction(fd);
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
      hierarchyPreview: result.hierarchyPreview,
      rowPreview: result.rowPreview,
      validationCsv: result.validationCsv,
    };
  }

  async function onConfirm(file: File): Promise<BulkImportCompletionSummary> {
    const fd = new FormData();
    fd.set("file", file);
    const summary = await confirmFacilityStructureImportAction(fd);
    router.refresh();
    return summary;
  }

  function handleClose() {
    onImported?.();
    onClose();
  }

  return (
    <BulkImportWizard
      title="Bulk Import — Facility Structure"
      description="Create Floors, Neighborhoods/Units, and Rooms/Spaces from a CSV. Existing exact hierarchy is reused; nothing is deleted or moved."
      templateFileName="ltc-facility-structure-import-template.csv"
      templateCsv={FACILITY_STRUCTURE_CSV_TEMPLATE}
      testIdPrefix="facility-bulk-import"
      onPreview={onPreview}
      onConfirm={onConfirm}
      onClose={handleClose}
      instructions={
        <>
          <p className="font-medium text-zinc-900">Import instructions</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Required columns: <code>floor</code>, <code>neighborhood</code>,{" "}
              <code>space</code>, <code>spaceType</code>
            </li>
            <li>
              Optional: <code>roomNumber</code>, <code>code</code>,{" "}
              <code>description</code>, <code>department</code>,{" "}
              <code>customTypeLabel</code>
            </li>
            <li>
              Space types use Facility Builder labels (e.g. Resident Room, Servery).
            </li>
            <li>
              One file builds the full Floor → Neighborhood → Room hierarchy. Repeated
              parent names create parents once.
            </li>
            <li>
              Exact existing matches are reused. Conflicts and type mismatches are
              errors — never silent overwrites.
            </li>
            <li>CSV only. Max 2,000 rows / 2 MB.</li>
          </ul>
        </>
      }
    />
  );
}
