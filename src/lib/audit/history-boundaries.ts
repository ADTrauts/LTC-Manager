/**
 * Asset and Location history are projections of source facts.
 * They are not copy ledgers.
 */

export const ASSET_HISTORY_SOURCES = [
  "OperationalEvidenceRecord",
  "AssetIssue",
  "Repair",
  "AssetStatusHistory",
] as const;

export const LOCATION_HISTORY_SOURCES = [
  "OperationalEvidenceRecord",
  "DepartmentWorkOccurrence",
  "OperationalCycleKeyPointActual",
  "OperationalAssignment",
] as const;
