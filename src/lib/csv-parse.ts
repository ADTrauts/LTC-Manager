/** Minimal CSV row parser (RFC 4180-style quoted fields, comma separator). */

export function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = parseCsvRow(lines[0]!);
  const rows: string[][] = [];
  for (let r = 1; r < lines.length; r++) {
    rows.push(parseCsvRow(lines[r]!));
  }
  return { headers, rows };
}
