export function complianceReportFilename(input: {
  facilityName: string;
  templateName: string;
  fromDateKey: string;
  toDateKey: string;
  extension: "pdf" | "xlsx" | "csv";
}): string {
  const facility = sanitizeReportToken(input.facilityName) || "Facility";
  const template = sanitizeReportToken(input.templateName) || "Compliance_Report";
  const from = input.fromDateKey;
  const to = input.toDateKey;
  const span = from === to ? from : `${from}_to_${to}`;
  return `${facility}_${template}_${span}.${input.extension}`;
}

export function sanitizeReportToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"`;
}
