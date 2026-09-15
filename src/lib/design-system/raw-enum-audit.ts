/**
 * Raw enum audit — user-visible technical values still reaching the UI.
 * Phase 1 fixed Employee EmploymentType + EmployeeStatus maps.
 * Do not globally title-case; add explicit label maps per domain.
 *
 * Remaining cleanup targets (not fixed in this pass unless trivial):
 */

export const RAW_ENUM_CLEANUP_TARGETS = [
  {
    domain: "Employee / Job Flow",
    examples: ["ACTIVE (jobFlow.state shown in employee-job-flow-panel)"],
    notes: "Job flow state may use different vocabulary than EmployeeStatus.",
  },
  {
    domain: "Assignments",
    examples: ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"],
    notes: "assignmentStatusLabel exists in scheduling lib — verify all surfaces use it.",
  },
  {
    domain: "Assets",
    examples: ["Asset status enums when ops flag off"],
    notes: "assetStatusLabel exists when flag on; raw status when flag off.",
  },
  {
    domain: "Operational Cycles",
    examples: ["DRAFT / PUBLISHED in some secondary strings"],
    notes: "Primary chrome uses section titles; keep STATUS enums out of primary rows.",
  },
  {
    domain: "Department Teams",
    examples: ["ACTIVE | ARCHIVED in internal types"],
    notes: "Confirm list UI never prints raw ARCHIVED.",
  },
  {
    domain: "Knowledge / Inspections / Evidence",
    examples: ["Category and status enums"],
    notes: "knowledge/labels.ts covers many; spot-check remaining raw option values.",
  },
] as const;
