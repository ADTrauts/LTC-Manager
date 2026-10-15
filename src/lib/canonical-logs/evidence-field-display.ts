/**
 * Shared presentation for OperationalEvidenceFieldValue.
 * One display helper for record detail, Log Book, and the CSV value column.
 */

export type EvidenceFieldDisplayInput = {
  fieldType: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueDateTime?: Date | string | null;
  valueSelections?: string[];
  unitLabel?: string | null;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatLocalDateLabel(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthLabel = MONTHS[month - 1];
  if (!monthLabel || day < 1 || day > 31) return isoDate;
  return `${monthLabel} ${day}, ${year}`;
}

export function formatLocalClockLabel(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return hhmm;
  let hour = Number(match[1]);
  const minute = match[2]!;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return hhmm;
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${suffix}`;
}

function dateText(value: EvidenceFieldDisplayInput): string | null {
  const text = value.valueText?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (value.valueDateTime) {
    const date = value.valueDateTime instanceof Date ? value.valueDateTime : new Date(value.valueDateTime);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }
  }
  return text || null;
}

function timeText(value: EvidenceFieldDisplayInput): string | null {
  const text = value.valueText?.trim() ?? "";
  if (/^\d{1,2}:\d{2}$/.test(text)) return text;
  if (value.valueDateTime) {
    const date = value.valueDateTime instanceof Date ? value.valueDateTime : new Date(value.valueDateTime);
    if (!Number.isNaN(date.getTime())) {
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }
  }
  return text || null;
}

export function formatEvidenceFieldDisplay(value: EvidenceFieldDisplayInput): string {
  if (value.fieldType === "TEMPERATURE" || value.fieldType === "NUMBER") {
    if (value.valueNumber == null) return "—";
    const unit = value.unitLabel?.trim() ? ` ${value.unitLabel.trim()}` : "";
    return `${value.valueNumber}${unit}`;
  }
  if (value.fieldType === "COMPLIANCE") {
    if (value.valueText === "COMPLIANT") return "Compliant";
    if (value.valueText === "NON_COMPLIANT") return "Non-Compliant";
    if (value.valueText === "NOT_APPLICABLE") return "N/A";
    return value.valueText?.trim() || "—";
  }
  if (value.fieldType === "PASS_NEEDS_ATTENTION") {
    if (value.valueText === "PASS") return "Pass";
    if (value.valueText === "NEEDS_ATTENTION") return "Needs attention";
    return value.valueText?.trim() || "—";
  }
  if (value.fieldType === "YES_NO") {
    if (value.valueBoolean === true) return "Yes";
    if (value.valueBoolean === false) return "No";
    if (value.valueText === "YES") return "Yes";
    if (value.valueText === "NO") return "No";
    return value.valueText?.trim() || "—";
  }
  if (value.fieldType === "ATTESTATION") {
    if (value.valueBoolean === true) return "Confirmed";
    if (value.valueBoolean === false) return "Not confirmed";
    if (value.valueText === "YES" || value.valueText === "true") return "Confirmed";
    return value.valueText?.trim() || "—";
  }
  if (value.fieldType === "DATE") {
    const raw = dateText(value);
    return raw ? formatLocalDateLabel(raw) : "—";
  }
  if (value.fieldType === "TIME") {
    const raw = timeText(value);
    return raw ? formatLocalClockLabel(raw) : "—";
  }
  if (value.fieldType === "MULTI_SELECT" || (value.valueSelections?.length ?? 0) > 0) {
    if (value.valueSelections && value.valueSelections.length > 0) {
      return value.valueSelections.join(", ");
    }
    return value.valueText?.trim() || "—";
  }
  if (value.fieldType === "SINGLE_SELECT") {
    return value.valueText?.trim() || value.valueSelections?.[0] || "—";
  }
  if (value.valueBoolean != null) return value.valueBoolean ? "Yes" : "No";
  return value.valueText?.trim() || "—";
}

/** One CSV `value` column. Prefer number, then the same readable display used on record detail. */
export function serializeEvidenceFieldForCsv(value: EvidenceFieldDisplayInput): string {
  if (
    (value.fieldType === "TEMPERATURE" || value.fieldType === "NUMBER") &&
    value.valueNumber != null
  ) {
    return String(value.valueNumber);
  }
  if (value.valueNumber != null && value.fieldType !== "YES_NO" && value.fieldType !== "ATTESTATION") {
    return String(value.valueNumber);
  }
  const display = formatEvidenceFieldDisplay(value);
  return display === "—" ? "" : display;
}
