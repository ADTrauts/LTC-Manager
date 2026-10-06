/**
 * Draft-time PM Plan validation for Build UX.
 * Incomplete drafts are allowed. These issues block publish, not save.
 */

import { isAssetLifecycleRetired } from "@/lib/asset-operations/ownership";
import { isPmPriorityPublishable } from "./version-semantics";
import { type CivilDate, compareCivilDates, isCivilDate, parseCivilDate } from "./civil-date";

export type PmDraftValidationIssue = {
  code: string;
  message: string;
};

export function collectPmDraftValidationIssues(input: {
  name: string;
  assetId: string | null | undefined;
  assetStatus?: string | null;
  maintenanceCategoryId: string | null | undefined;
  categoryArchived?: boolean;
  intervalMonths: number;
  generationLeadDays: number;
  priority: string;
  anchorDate: string;
  effectiveDate: string | null | undefined;
  facilityToday: CivilDate;
  procedureVersionId?: string | null;
  procedureEligible?: boolean | null;
  recordTemplateIds?: string[];
  recordTemplatesEligible?: boolean | null;
  firstPublish: boolean;
  priorEffectiveDate?: CivilDate | null;
}): PmDraftValidationIssue[] {
  const issues: PmDraftValidationIssue[] = [];
  if (!input.name.trim()) {
    issues.push({ code: "NAME", message: "Name is required." });
  }
  if (!input.assetId) {
    issues.push({ code: "ASSET", message: "Select an Asset." });
  } else if (input.assetStatus && isAssetLifecycleRetired(input.assetStatus)) {
    issues.push({
      code: "ASSET_RETIRED",
      message: "This Asset is retired. Choose an active Asset before publishing.",
    });
  }
  if (!input.maintenanceCategoryId) {
    issues.push({ code: "CATEGORY", message: "Maintenance category is required to publish." });
  } else if (input.categoryArchived) {
    issues.push({
      code: "CATEGORY_ARCHIVED",
      message: "This maintenance category is archived. Choose an active category.",
    });
  }
  if (!Number.isInteger(input.intervalMonths) || input.intervalMonths < 1) {
    issues.push({ code: "INTERVAL", message: "Repeat every N months must be a whole number of 1 or more." });
  }
  if (!Number.isInteger(input.generationLeadDays) || input.generationLeadDays < 0) {
    issues.push({
      code: "LEAD",
      message: "Create Work Order this many days before scheduled date must be 0 or more.",
    });
  }
  if (!isPmPriorityPublishable(input.priority) || input.priority === "EMERGENCY") {
    issues.push({
      code: "PRIORITY",
      message: "Preventive Maintenance cannot use Emergency priority. Choose Routine, High, or Urgent.",
    });
  }
  if (!isCivilDate(input.anchorDate)) {
    issues.push({ code: "ANCHOR", message: "Schedule start date is required." });
  }
  if (input.effectiveDate) {
    if (!isCivilDate(input.effectiveDate)) {
      issues.push({ code: "EFFECTIVE", message: "Changes take effect on a valid date." });
    } else {
      const effective = parseCivilDate(input.effectiveDate);
      if (compareCivilDates(effective, input.facilityToday) < 0) {
        issues.push({
          code: "EFFECTIVE_PAST",
          message: "Effective date cannot be in the past.",
        });
      }
      if (
        !input.firstPublish &&
        input.priorEffectiveDate &&
        compareCivilDates(effective, input.priorEffectiveDate) <= 0
      ) {
        issues.push({
          code: "EFFECTIVE_SUCCESSOR",
          message: "Changes must take effect after the currently published configuration.",
        });
      }
    }
  }
  if (input.procedureVersionId && input.procedureEligible === false) {
    issues.push({
      code: "PROCEDURE",
      message: "Choose a published Procedure. Drafts, Reference, and Training cannot be pinned.",
    });
  }
  if ((input.recordTemplateIds?.length ?? 0) > 0 && input.recordTemplatesEligible === false) {
    issues.push({
      code: "RECORDS",
      message: "Required evidence must pin published Record templates.",
    });
  }
  return issues;
}
