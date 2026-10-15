import { loadAuditOperationalRecords } from "@/lib/audit/load-audit-records";
import { complianceReportAccessDecision } from "@/lib/compliance-report/authorize-compliance-report";
import { complianceReportDayCount, composeComplianceReport } from "@/lib/compliance-report/compose-compliance-report";
import { renderComplianceCsv } from "@/lib/compliance-report/render-compliance-csv";
import { renderCompliancePdf } from "@/lib/compliance-report/render-compliance-pdf";
import { renderComplianceWorkbook } from "@/lib/compliance-report/render-compliance-workbook";
import { contentDisposition, complianceReportFilename } from "@/lib/compliance-report/report-filename";
import { PDF_REPORT_MAX_DAYS, type ComplianceCsvMode, type ComplianceReportFormat } from "@/lib/compliance-report/types";
import { getEvidenceMediaStore } from "@/lib/canonical-logs/evidence-media";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { resolveDepartmentMembershipIds } from "@/lib/employee-membership";
import { getSession } from "@/lib/auth";
import { loadFacilityTimezone } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session?.facilityId || session.scopeKind !== "facility") {
    return new Response("Sign in required.", { status: 401 });
  }
  const url = new URL(request.url);
  const requestedDepartmentId = url.searchParams.get("departmentId")?.trim() ?? "";
  const definition = url.searchParams.get("definition")?.trim() ?? "";
  const from = url.searchParams.get("from")?.trim() ?? "";
  const to = url.searchParams.get("to")?.trim() ?? "";
  const format = (url.searchParams.get("format")?.trim() || "csv") as ComplianceReportFormat;
  const mode = (url.searchParams.get("mode")?.trim() || "slots") as ComplianceCsvMode;
  if (!definition || !from || !to || (format !== "pdf" && format !== "xlsx" && format !== "csv")) {
    return new Response("Choose a record and date range.", { status: 400 });
  }
  if (format === "pdf" && complianceReportDayCount(from, to) > PDF_REPORT_MAX_DAYS) {
    return new Response(`PDF reports cover up to ${PDF_REPORT_MAX_DAYS} service days. Use Excel or CSV for a longer range.`, {
      status: 400,
    });
  }

  const departments = await prisma.department.findMany({
    where: { facilityId: session.facilityId },
    select: { id: true, name: true },
  });
  const admin = "role" in session && session.role && isFacilityAdministratorRole(session.role);
  let members: string[] | "ALL" = "ALL";
  if (!admin) {
    const employeeId = await getOperationalEmployeeIdForSession(session);
    const employee = employeeId
      ? await prisma.employee.findFirst({
          where: { id: employeeId, facilityId: session.facilityId },
          select: { primaryDepartmentId: true, employeeDepartments: { select: { departmentId: true } } },
        })
      : null;
    members = employee ? resolveDepartmentMembershipIds(employee) : [];
  }
  const access = complianceReportAccessDecision({
    sessionFacilityId: session.facilityId,
    requestedDepartmentId,
    facilityDepartmentIds: departments.map((row) => row.id),
    memberDepartmentIds: members,
  });
  if (!access.ok) return new Response(access.message, { status: access.status });

  const facility = await prisma.facility.findFirst({
    where: { id: session.facilityId },
    select: { displayName: true },
  });
  const timezone = await loadFacilityTimezone(prisma, session.facilityId);
  const locationFunction = url.searchParams.get("locationFunction");
  const loaded = await Promise.all(
    access.departmentIds.map((departmentId) =>
      loadAuditOperationalRecords(prisma, {
        facilityId: session.facilityId,
        departmentId,
        fromDateKey: from,
        toDateKey: to,
        catalogStableKey: definition,
        locationFunctionKey: locationFunction,
      }),
    ),
  );
  const slots = loaded.flatMap((result) => result.slots);
  const recordIds = slots.map((slot) => slot.record?.id).filter((id): id is string => Boolean(id));
  const [attachmentRows, issueRows] = await Promise.all([
    recordIds.length === 0
      ? Promise.resolve([])
      : prisma.operationalEvidenceAttachment.findMany({
          where: { facilityId: session.facilityId, recordId: { in: recordIds } },
        }),
    recordIds.length === 0
      ? Promise.resolve([])
      : prisma.assetIssue.findMany({
          where: { facilityId: session.facilityId, originEvidenceRecordId: { in: recordIds } },
          select: { id: true, originEvidenceRecordId: true, status: true },
        }),
  ]);
  const departmentName =
    access.departmentIds.length === 1
      ? (departments.find((row) => row.id === access.departmentIds[0])?.name ?? "Department")
      : "All departments";
  const report = composeComplianceReport({
    metadata: {
      facilityName: facility?.displayName ?? "Facility",
      departmentName,
      templateName: slots[0]?.definitionLabel || definition,
      templateStableKey: definition,
      fromDateKey: from,
      toDateKey: to,
      generatedAt: new Date().toISOString(),
      generatedBy: session.name || "Signed-in user",
      timezone,
      filters: [locationFunction ? `Location function ${locationFunction}` : "All locations"].filter(Boolean),
    },
    slots,
    attachments: attachmentRows.map((row) => ({
      id: row.id,
      recordId: row.recordId,
      kind: row.kind,
      filename: row.originalFilename ?? row.kind,
      contentType: row.contentType,
      signedBy: row.kind === "SIGNATURE" ? row.uploadedByLabel : null,
      signedAt: row.kind === "SIGNATURE" ? row.createdAt.toISOString() : null,
    })),
    issuesByRecordId: Object.fromEntries(
      issueRows
        .filter((row) => row.originEvidenceRecordId)
        .map((row) => [row.originEvidenceRecordId as string, `${row.id.slice(0, 8)} / ${row.status}`]),
    ),
  });
  const filename = complianceReportFilename({
    facilityName: report.metadata.facilityName,
    templateName: report.metadata.templateName,
    fromDateKey: from,
    toDateKey: to,
    extension: format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv",
  });

  if (format === "csv") {
    const body = renderComplianceCsv(report, mode === "responses" ? "responses" : "slots");
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(filename),
      },
    });
  }
  if (format === "xlsx") {
    const body = await renderComplianceWorkbook(report);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(filename),
      },
    });
  }
  const images = new Map<string, Buffer>();
  const store = getEvidenceMediaStore();
  if (store) {
    for (const row of attachmentRows) {
      if (row.kind === "FILE" || row.sizeBytes > 1_200_000) continue;
      if (!row.contentType.startsWith("image/")) continue;
      const bytes = await store.get(row.storageKey);
      if (bytes) images.set(row.id, Buffer.from(bytes));
    }
  }
  const pdf = await renderCompliancePdf(report, images);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(filename),
    },
  });
}
