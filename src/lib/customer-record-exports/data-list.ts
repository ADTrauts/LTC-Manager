import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { parseLogSubmissionSnapshot } from "@/lib/canonical-logs/snapshot";
const field = z.object({
    key: z.string().min(1),
    group: z.string(),
    label: z.string(),
    type: z.string().min(1),
    unit: z.string(),
});
const definition = z.object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    name: z.string(),
    fields: z.array(field).max(500),
});
export const exportDataListSchema = z.array(definition).min(1).max(50);
export type ExportDataList = z.output<typeof exportDataListSchema>;
export type RecordDefinition = {
    catalogDefinitionId: string | null;
    templateStableKey: string;
    templateVersion: number;
    templateSnapshotJson: Prisma.JsonValue;
};
const omittedTypes = new Set(["PHOTO", "FILE", "SIGNATURE"]);
/** Approval metadata only: labels and typed keys, never response values or instructions. */
export function describeRecordData(record: RecordDefinition): ExportDataList[number] {
    const snapshot = parseLogSubmissionSnapshot(record.templateSnapshotJson);
    if (!snapshot || snapshot.catalog.id !== record.catalogDefinitionId ||
        snapshot.catalog.stableKey !== record.templateStableKey ||
        snapshot.catalog.version !== record.templateVersion) {
        throw new Error("Record definition identity is unverified.");
    }
    const fields = [
        ...snapshot.catalog.fields.filter(f => !omittedTypes.has(f.fieldType)).map(f => ({
            key: f.fieldKey, group: "", label: f.label, type: f.fieldType, unit: f.unitLabel ?? "",
        })),
        ...(snapshot.catalog.repeatingGroups ?? []).flatMap(g => g.columns
            .filter(c => !omittedTypes.has(c.fieldType)).map(c => ({
            key: c.columnKey, group: g.groupKey, label: `${g.label}: ${c.label}`,
            type: c.fieldType, unit: c.unitLabel ?? "",
        }))),
    ].sort((a, b) => a.group.localeCompare(b.group) || a.key.localeCompare(b.key));
    return definition.parse({
        id: snapshot.catalog.id, version: snapshot.catalog.version, name: snapshot.catalog.name, fields
    });
}
export function describeRequestedData(records: RecordDefinition[]): ExportDataList {
    const definitions = new Map<string, ExportDataList[number]>();
    for (const record of records) {
        const next = describeRecordData(record);
        const prior = definitions.get(next.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(next)) {
            throw new Error("Record definition changed within this report.");
        }
        definitions.set(next.id, next);
    }
    const data = exportDataListSchema.parse([...definitions.values()].sort((a, b) => a.id.localeCompare(b.id)));
    if (data.reduce((sum, d) => sum + d.fields.length, 0) > 500)
        throw new Error("Data list exceeds 500 fields.");
    return data;
}
