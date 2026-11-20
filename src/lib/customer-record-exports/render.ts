import ExcelJS from "exceljs";
import type { Prisma, CustomerRecordExportRequest } from "@prisma/client";
import { describeRecordData, exportDataListSchema } from "./data-list";
import { complianceReportFilename } from "@/lib/compliance-report/report-filename";
type RecordRow = {
    id: string;
    catalogDefinitionId: string | null;
    templateStableKey: string;
    templateVersion: number;
    operationalDate: Date;
    placeLabelSnapshot: string | null;
    recordedAt: Date;
    recordedByLabel: string | null;
    status: string;
    outOfStandard: boolean;
    correctiveActionText: string | null;
    templateSnapshotJson: Prisma.JsonValue;
    values: {
        fieldKey: string;
        fieldType: string;
        groupKey: string;
        rowKey: string;
        valueText: string | null;
        valueNumber: number | null;
        valueBoolean: boolean | null;
        valueDateTime: Date | null;
        valueSelections: string[];
    }[];
};
import { EXPORT_COLUMNS } from "./manifest";
function csv(value: unknown) {
    let s = String(value ?? "");
    if (/^[\s\u0000-\u001f]*[=+@-]/u.test(s))
        s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
}
export async function renderRequestedReport(request: CustomerRecordExportRequest, facility: string, department: string, records: RecordRow[]) {
    const approvedData = exportDataListSchema.parse(request.dataList);
    const generatedAt = new Date().toISOString();
    const manifest = [["Manifest version", "1"], ["Request", request.id], ["Facility", facility], ["Department", department], ["Record key", request.recordKey], ["From", request.fromDate], ["To", request.toDate], ["Generated at UTC", generatedAt], ["Dataset", "Current persisted responses at generation; not an expected/missed-slot report"], ["Records", String(records.length)], ["Exclusions", "Vendor/private data, HR, attachments, credentials and internal staff notes"], ["Columns", EXPORT_COLUMNS.join(", ")]];
    const rows: string[][] = [];
    for (const record of records) {
        const currentData = describeRecordData(record);
        if (!approvedData.some(d => JSON.stringify(d) === JSON.stringify(currentData)))
            throw new Error("The Record field list changed; submit a new request.");
        for (const v of record.values.length ? record.values : [null]) {
            const column = v ? currentData.fields.find(f => f.key === v.fieldKey && f.group === v.groupKey) : null;
            if (v && (!column || column.type !== v.fieldType))
                throw new Error("Response definition is outside the approved data list.");
            const response = !v ? "" : v.valueNumber !== null ? String(v.valueNumber) : v.valueBoolean !== null ? String(v.valueBoolean) : v.valueDateTime ? v.valueDateTime.toISOString() : v.valueSelections.length ? v.valueSelections.join("; ") : v.valueText ?? "";
            rows.push([record.id, record.operationalDate.toISOString().slice(0, 10), record.placeLabelSnapshot ?? "Unknown historical location", record.recordedAt.toISOString(), record.recordedByLabel ?? "Unknown", record.status, String(record.outOfStandard), column?.label ?? "", v?.groupKey ?? "", v?.rowKey ?? "", response, column?.unit ?? "", record.correctiveActionText ?? ""]);
        }
    }
    // Reject oversized content before constructing a workbook; no partial export.
    if (Buffer.byteLength(JSON.stringify(rows)) > 8000000)
        throw new Error("Report is too large. Choose fewer dates.");
    let bytes: Buffer;
    if (request.format === "csv")
        bytes = Buffer.from([...manifest, ...approvedData.flatMap(d => d.fields.map(f => ["Approved field", d.name, String(d.version), f.group, f.label, f.type, f.unit])), [], EXPORT_COLUMNS, ...rows].map(row => row.map(csv).join(",")).join("\r\n"), "utf8");
    else {
        if (rows.some(row => row.some(cell => cell.length > 32767)))
            throw new Error("A response exceeds Excel’s cell limit. Request CSV instead.");
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Vssyl";
        workbook.addWorksheet("Manifest").addRows(manifest);
        workbook.addWorksheet("Approved fields").addRows([["Record", "Version", "Group", "Field", "Type", "Unit"], ...approvedData.flatMap(d => d.fields.map(f => [d.name, String(d.version), f.group, f.label, f.type, f.unit]))]);
        const sheet = workbook.addWorksheet("Responses");
        sheet.addRow(EXPORT_COLUMNS);
        sheet.addRows(rows);
        sheet.views = [{
                state: "frozen", ySplit: 1
            }];
        sheet.columns.forEach(column => { column.width = 24; });
        bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    }
    if (bytes.length > 4000000)
        throw new Error("Report is too large. Choose fewer dates.");
    return {
        bytes, filename: complianceReportFilename({
            facilityName: facility, templateName: request.recordKey, fromDateKey: request.fromDate, toDateKey: request.toDate, extension: request.format === "xlsx" ? "xlsx" : "csv"
        }), contentType: request.format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8"
    };
}
