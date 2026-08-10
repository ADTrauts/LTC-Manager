"use client";

import { useRouter } from "next/navigation";

import {
  BulkImportWizard,
  type BulkImportPreviewModel,
} from "@/components/build/bulk-import-wizard";
import {
  FACILITY_LOCATION_TYPE_LABELS,
  FACILITY_STRUCTURE_CSV_TEMPLATE,
} from "@/lib/bulk-import/facility-structure";
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
      description="Create Floors, Neighborhoods/Units, and Locations from a CSV. Existing exact hierarchy is reused; nothing is deleted or moved."
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
              Columns: <code>floor</code>, <code>neighborhood</code>,{" "}
              <code>locationName</code>, <code>locationType</code>,{" "}
              <code>roomNumber</code>, <code>code</code>, <code>description</code>,{" "}
              <code>department</code>, <code>customTypeLabel</code>
            </li>
            <li>
              <strong>Location Name:</strong> The name people use for this room or area,
              such as Room 101, Servery, Dining Room, or Dietitian Office.
            </li>
            <li>
              <strong>Location Type:</strong> The category of location, such as Resident
              Room, Servery, Office, or Storage. Accepted values include:{" "}
              {FACILITY_LOCATION_TYPE_LABELS.join(", ")}.
            </li>
            <li>
              <strong>Room Number:</strong> Optional. Use only when the location has a
              room number.
            </li>
            <li>
              You may leave Location Name blank when the row is only creating a Floor or
              Neighborhood.
            </li>
            <li>
              Rows may create Floor only, Floor + Neighborhood, or Floor + Neighborhood +
              Location. Do not invent placeholder locations.
            </li>
            <li>
              Exact existing matches are reused. Conflicts and type mismatches are errors
              — never silent overwrites.
            </li>
            <li>CSV only. Max 2,000 rows / 2 MB.</li>
          </ul>
        </>
      }
    />
  );
}
