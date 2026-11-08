/**
 * Factual notification copy for N1C persistence.
 * This is not the Notification Center.
 */

import type { CoverageDisplay } from "./payload";

export function coveragePresentation(display: CoverageDisplay, serviceDate: string): {
  title: string;
  body: string;
  actionPath: string;
} {
  return {
    title: "Coverage needs attention",
    body: `${display.locationLabel} · ${display.cycleLabel}`,
    actionPath: `/staffing?date=${serviceDate}`,
  };
}

export function assignmentPresentation(subjectLabel: string): {
  title: string;
  body: string;
  actionPath: string;
} {
  return {
    title: "Assignment changed",
    body: subjectLabel,
    actionPath: "/staffing/assignments",
  };
}

export function keyPointPresentation(input: {
  locationLabel: string;
  keyPointLabel: string;
  expectedLocal: string;
}): {
  title: string;
  body: string;
  actionPath: string;
} {
  return {
    title: "Key Point is overdue",
    body: `${input.locationLabel} · ${input.keyPointLabel} · Due ${input.expectedLocal}`,
    actionPath: "/staffing/cycles",
  };
}

export function workOrderAssignmentPresentation(input: {
  repairId: string;
  locationLabel: string;
  subjectLabel: string;
}): {
  title: string;
  body: string;
  actionPath: string;
} {
  const place = input.locationLabel.trim() || "this location";
  const subject = input.subjectLabel.trim();
  const body =
    subject && subject !== "Work Order"
      ? `You were assigned a Work Order for ${place} — ${subject}.`
      : `You were assigned a Work Order for ${place}.`;
  return {
    title: "Work Order assigned",
    body,
    actionPath: `/repairs/${input.repairId}`,
  };
}

export function workOrderInterventionPresentation(input: {
  repairId: string;
  locationLabel: string;
  subjectLabel: string;
}): {
  title: string;
  body: string;
  actionPath: string;
} {
  const place = input.locationLabel.trim();
  const subject = input.subjectLabel.trim() || "Work Order";
  const body = place
    ? `${subject} at ${place} requires immediate operational response.`
    : `${subject} requires immediate operational response.`;
  return {
    title: "Immediate Work Order response required",
    body,
    actionPath: `/repairs/${input.repairId}`,
  };
}

export function workOrderOverduePresentation(input: {
  repairId: string;
  locationLabel: string;
  subjectLabel: string;
}): {
  title: string;
  body: string;
  actionPath: string;
} {
  const place = input.locationLabel.trim() || "this location";
  const subject = input.subjectLabel.trim();
  const body =
    subject && subject !== "Work Order"
      ? `A Work Order for ${place} passed its deadline — ${subject}.`
      : `A Work Order for ${place} passed its deadline.`;
  return {
    title: "Work Order is overdue",
    body,
    actionPath: `/repairs/${input.repairId}`,
  };
}

export function issueCreatedPresentation(input: {
  issueId: string;
  locationLabel: string;
  subjectLabel: string;
}): {
  title: string;
  body: string;
  actionPath: string;
} {
  const place = input.locationLabel.trim();
  const subject = input.subjectLabel.trim() || "An Issue";
  const body = place ? `${subject} was reported at ${place}.` : `${subject} was reported.`;
  return {
    title: "Issue reported",
    body,
    actionPath: `/asset-issues/${input.issueId}`,
  };
}

export function assetOutOfServicePresentation(input: {
  assetId: string;
  locationLabel: string;
  subjectLabel: string;
}): {
  title: string;
  body: string;
  actionPath: string;
} {
  const place = input.locationLabel.trim();
  const subject = input.subjectLabel.trim() || "An Asset";
  const body = place
    ? `${subject} was taken out of service at ${place}.`
    : `${subject} was taken out of service.`;
  return {
    title: "Asset out of service",
    body,
    actionPath: `/assets/${input.assetId}`,
  };
}

export function evidenceFailedPresentation(input: {
  recordId: string;
  locationLabel: string;
  subjectLabel: string;
}): {
  title: string;
  body: string;
  actionPath: string;
} {
  const place = input.locationLabel.trim();
  const subject = input.subjectLabel.trim() || "A Record";
  const body = place ? `${subject} for ${place} was submitted out of standard.` : `${subject} was submitted out of standard.`;
  return {
    title: "Record submitted out of standard",
    body,
    actionPath: `/staffing/logs/records/${input.recordId}`,
  };
}

export function publicationPresentation(subjectLabel: string): {
  title: string;
  body: string;
  actionPath: null;
} {
  return {
    title: "Publication failed",
    body: subjectLabel,
    actionPath: null,
  };
}
