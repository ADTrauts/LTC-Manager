import type { AuditRecordSlot } from "@/lib/audit/audit-records";

export const PDF_REPORT_MAX_DAYS = 93;

export type ComplianceReportFormat = "pdf" | "xlsx" | "csv";
export type ComplianceCsvMode = "slots" | "responses";

export type ComplianceReportMetadata = {
  facilityName: string;
  departmentName: string;
  templateName: string;
  templateStableKey: string;
  fromDateKey: string;
  toDateKey: string;
  generatedAt: string;
  generatedBy: string;
  timezone: string;
  filters: string[];
};

export type ComplianceVersionUse = {
  version: number;
  records: number;
};

export type ComplianceResponseRow = {
  recordId: string;
  serviceDate: string;
  location: string;
  section: string;
  field: string;
  response: string;
  unit: string;
  notApplicable: boolean;
  outOfStandard: boolean;
  scoreWeight: number | null;
  earned: number | null;
  critical: boolean;
  group?: string;
  row?: string;
};

export type ComplianceAttachmentRef = {
  id: string;
  recordId: string;
  kind: "PHOTO" | "FILE" | "SIGNATURE";
  filename: string;
  contentType: string;
  signedBy: string | null;
  signedAt: string | null;
};

export type ComplianceReportRecord = {
  slot: AuditRecordSlot;
  recordId: string | null;
  statusLabel: string;
  countedAsScheduled: boolean;
  countedAsCompleted: boolean;
  countedAsMissed: boolean;
  corrected: boolean;
  issueLabel: string | null;
};

export type ComplianceReport = {
  metadata: ComplianceReportMetadata;
  versions: ComplianceVersionUse[];
  summary: {
    expected: number;
    completed: number;
    missed: number;
    overdue: number;
    waived: number;
    upcoming: number;
    notYetDue: number;
    needsSetup: number;
    needsReview: number;
    exceptions: number;
    averageInspectionScore: number | null;
    failedInspections: number;
    criticalFailures: number;
  };
  templateLines: Array<{
    templateKey: string;
    label: string;
    line: string;
    expected: number;
    completed: number;
    missed: number;
    overdue: number;
    waived: number;
    exceptions: number;
    averageInspectionScore: number | null;
    failedInspections: number;
    criticalFailures: number;
  }>;
  records: ComplianceReportRecord[];
  responses: ComplianceResponseRow[];
  exceptions: ComplianceReportRecord[];
  attachments: ComplianceAttachmentRef[];
  slots: AuditRecordSlot[];
};
