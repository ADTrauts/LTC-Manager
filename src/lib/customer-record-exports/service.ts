import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { FacilitySession } from "@/lib/auth";
import { validateSessionAuthority } from "@/lib/session-revocation";
import { userHoldsFacilityAdministratorSeat } from "@/lib/facility-access";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { lockHarborStaffSession, type HarborJwtPayload } from "@/lib/harbor-console/auth";
import { describeRequestedData, type ExportDataList } from "./data-list";
type Tx = Prisma.TransactionClient;
export class ExportDenied extends Error {
}
function deny(message: string): never { throw new ExportDenied(message); }
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const SCOPE_NOTICE = "Recorded responses from one self-operated Department and Record, for the approved dates. Current data at download time; CSV or Excel. No vendor data, HR, attachments, credentials or internal staff notes. Only the requesting current Administrator can download, within 24 hours of approval. No export file is stored and no email is sent.";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + "T00:00:00Z"); return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v; });
export const exportRequestSchema = z.object({
    id: z.uuid().transform(v => v.toLowerCase()), departmentId: z.string().trim().min(1).max(128), recordKey: z.string().trim().min(1).max(160), fromDate: date, toDate: date, format: z.enum(["csv", "xlsx"])
}).refine(v => { const days = (+new Date(v.toDate) - +new Date(v.fromDate)) / 86400000; return days >= 0 && days < 93; }, {
    message: "Choose up to 93 service days."
});
export type ExportInput = z.output<typeof exportRequestSchema>;
export async function requireExportCustomer(tx: Tx, s: FacilitySession) {
    if (typeof s.exp !== "number" || s.exp * 1000 <= Date.now() || s.scopeKind !== "facility" || s.authKind !== "user" || s.role !== "FACILITY_ADMINISTRATOR" || s.accessKind || !(await validateSessionAuthority(s, tx)).valid ||
        !(await userHoldsFacilityAdministratorSeat(tx, {
            userId: s.uid, facilityId: s.facilityId
        })))
        deny("Current Facility Administrator sign-in is required.");
}
// Facility lock serializes operating/seat changes and the operational write guards.
// User UPDATE lock also serializes per-login logout receipt inserts through their User FK.
async function lockCustomer(tx: Tx, s: FacilitySession) {
    await tx.$queryRaw `SELECT "id" FROM "Facility" WHERE "id"=${s.facilityId} FOR UPDATE`;
    await tx.$queryRaw `SELECT "id" FROM "User" WHERE "id"=${s.uid} FOR UPDATE`;
    await tx.$queryRaw `SELECT "id" FROM "UserFacilityAccess" WHERE "userId"=${s.uid} AND "facilityId"=${s.facilityId} FOR SHARE`;
    await requireExportCustomer(tx, s);
}
async function scope(tx: Tx, s: FacilitySession, input: Pick<ExportInput, "departmentId" | "recordKey" | "fromDate" | "toDate">) {
    const facility = await tx.facility.findUnique({
        where: {
            id: s.facilityId
        }, select: {
            organizationId: true, displayName: true
        }
    });
    const department = await tx.department.findFirst({
        where: {
            id: input.departmentId, facilityId: s.facilityId
        }, select: {
            name: true
        }
    });
    const access = await resolveDepartmentAccess(tx, s, {
        facilityId: s.facilityId, departmentId: input.departmentId
    });
    if (!facility || !department || !access?.canReadComplianceRecords || access.operatingModel !== "FACILITY_OPERATED")
        deny("This Department is outside the approved self-operated report scope.");
    const from = new Date(input.fromDate + "T00:00:00Z"), to = new Date(input.toDate + "T00:00:00Z");
    const periods = await tx.departmentOperatorRelationship.findMany({
        where: {
            departmentId: input.departmentId, effectiveFrom: {
                lte: to
            }, OR: [{
                    effectiveTo: null
                }, {
                    effectiveTo: {
                        gte: from
                    }
                }]
        }, select: {
            id: true, organizationId: true, effectiveFrom: true, effectiveTo: true
        }
    });
    for (let day = +from; day <= +to; day += 86400000) {
        const active = periods.filter(p => +p.effectiveFrom <= day && (!p.effectiveTo || +p.effectiveTo >= day));
        if (active.length !== 1 || active[0].organizationId !== facility!.organizationId)
            deny("The dates include vendor-operated, overlapping or unverified ownership. Choose a self-operated date range.");
    }
    const definitions = await tx.catalogLogDefinition.findMany({
        where: {
            stableKey: input.recordKey, OR: [{
                    ownerKind: "VSSYL"
                }, {
                    ownerKind: "FACILITY", ownerFacilityId: s.facilityId
                }]
        }, select: {
            id: true
        }
    });
    if (!definitions.length)
        deny("Choose a platform or Facility-owned Record.");
    const where = {
        facilityId: s.facilityId, departmentId: input.departmentId, templateStableKey: input.recordKey, operationalDate: {
            gte: from, lte: to
        }
    } satisfies Prisma.OperationalEvidenceRecordWhereInput;
    const outside = await tx.operationalEvidenceRecord.count({
        where: {
            ...where, OR: [{
                    operatorPeriodId: null
                }, {
                    operatorPeriodId: {
                        notIn: periods.map(p => p.id)
                    }
                }, {
                    catalogDefinitionId: null
                }, {
                    catalogDefinitionId: {
                        notIn: definitions.map(d => d.id)
                    }
                }]
        }
    });
    if (outside)
        deny("Some Records have private or unverified ownership. Narrow the request; nothing is exported from this range.");
    const count = await tx.operationalEvidenceRecord.count({
        where
    });
    if (count > 2000)
        deny("This report exceeds 2,000 Records. Choose a smaller date range.");
    return {
        facility: facility!, department: department!, where, count
    };
}
export async function createExportRequest(db: PrismaClient, s: FacilitySession, raw: unknown) {
    const parsed = exportRequestSchema.safeParse(raw);
    if (!parsed.success)
        deny("Choose a Department, Record key, format and valid date range of up to 93 days.");
    const input = parsed.data;
    return db.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${`customer-export:${input.id}`},0))`;
        await lockCustomer(tx, s);
        const fingerprint = hash(JSON.stringify([s.facilityId, s.uid, input]));
        const prior = await tx.customerRecordExportRequest.findUnique({
            where: {
                id: input.id
            }
        });
        if (prior) {
            if (prior.fingerprint !== fingerprint)
                deny("Request reference already used. Refresh the page.");
            return prior.id;
        }
        const plan = await scope(tx, s, input);
        if (!plan.count)
            deny("No recorded responses exist for this range. Choose dates with existing Records.");
        const definitions = await tx.operationalEvidenceRecord.findMany({
            where: plan.where,
            select: {
                catalogDefinitionId: true, templateStableKey: true, templateVersion: true, templateSnapshotJson: true
            },
        });
        let dataList: ExportDataList;
        try {
            dataList = describeRequestedData(definitions);
        }
        catch {
            deny("The report’s field list could not be verified or is too broad. Narrow the dates or contact Support.");
        }
        const pending = await tx.customerRecordExportRequest.count({
            where: {
                facilityId: s.facilityId, requesterId: s.uid, status: "PENDING"
            }
        });
        if (pending >= 25)
            deny("Resolve or cancel existing requests before submitting another.");
        await tx.customerRecordExportRequest.create({
            data: {
                ...input, dataList, facilityId: s.facilityId, requesterId: s.uid, requesterLabel: s.name, fingerprint, events: {
                    create: {
                        action: "REQUESTED", actorId: s.uid, actorKind: "CUSTOMER"
                    }
                }
            }
        });
        return input.id;
    }, {
        isolationLevel: "ReadCommitted", timeout: 15000
    });
}
async function lockRequest(tx: Tx, id: string) {
    await tx.$queryRaw `SELECT "id" FROM "CustomerRecordExportRequest" WHERE "id"=${id}::uuid FOR UPDATE`;
    const r = await tx.customerRecordExportRequest.findUnique({
        where: {
            id
        }
    });
    if (!r)
        deny("Request not found.");
    return r!;
}
export async function decideExportRequest(db: PrismaClient, s: HarborJwtPayload, id: string, revision: number, decision: "APPROVED" | "DENIED" | "REVOKED") {
    if (!z.uuid().safeParse(id).success || !Number.isSafeInteger(revision) || revision < 0)
        deny("Invalid request.");
    return db.$transaction(async (tx) => {
        const a = await lockHarborStaffSession(s, tx);
        if (!a.valid || a.staff.role !== "OWNER")
            deny("Current OWNER sign-in is required.");
        const meta = await tx.customerRecordExportRequest.findUnique({
            where: {
                id
            }, select: {
                facilityId: true
            }
        });
        if (!meta)
            deny("Request not found.");
        await tx.$queryRaw `SELECT "id" FROM "Facility" WHERE "id"=${meta!.facilityId} FOR UPDATE`;
        const r = await lockRequest(tx, id);
        if (r.revision !== revision)
            deny("This request changed. Refresh and review it.");
        if (decision === "REVOKED" ? r.status !== "APPROVED" : r.status !== "PENDING")
            deny("This transition is unavailable. A new approval requires a new customer request.");
        const now = new Date();
        if (decision === "APPROVED") {
            const current = await tx.userFacilityAccess.findFirst({
                where: {
                    facilityId: r.facilityId, userId: r.requesterId, isActive: true, revokedAt: null, user: {
                        isActive: true
                    }, rolePeriods: {
                        some: {
                            roleKey: "FACILITY_ADMINISTRATOR", startsAt: {
                                lte: now
                            }, OR: [{
                                    endsAt: null
                                }, {
                                    endsAt: {
                                        gt: now
                                    }
                                }]
                        }
                    }
                }, select: {
                    id: true
                }
            });
            if (!current || !(await userHoldsFacilityAdministratorSeat(tx, {
                userId: r.requesterId, facilityId: r.facilityId
            })))
                deny("The requester is no longer the current Administrator.");
        }
        const ownerNow = await lockHarborStaffSession(s, tx);
        if (!ownerNow.valid || ownerNow.staff.role !== "OWNER")
            deny("Current OWNER sign-in is required.");
        await tx.customerRecordExportRequest.update({
            where: {
                id
            }, data: {
                status: decision, revision: {
                    increment: 1
                }, ...(decision === "APPROVED" ? {
                    approvedById: s.uid, approvedAt: now, expiresAt: new Date(+now + 86400000)
                } : {})
            }
        });
        await tx.customerRecordExportEvent.create({
            data: {
                requestId: id, action: decision, actorId: s.uid, actorKind: "OWNER"
            }
        });
    }, {
        isolationLevel: "ReadCommitted", timeout: 15000
    });
}
export async function cancelExportRequest(db: PrismaClient, s: FacilitySession, id: string) {
    if (!z.uuid().safeParse(id).success)
        deny("Invalid request.");
    await db.$transaction(async (tx) => {
        await lockCustomer(tx, s);
        const r = await lockRequest(tx, id);
        if (r.facilityId !== s.facilityId || r.requesterId !== s.uid)
            deny("Request not found.");
        if (r.status !== "PENDING" && r.status !== "APPROVED")
            deny("This request is already closed.");
        await tx.customerRecordExportRequest.update({
            where: {
                id
            }, data: {
                status: "CANCELLED", revision: {
                    increment: 1
                }
            }
        });
        await tx.customerRecordExportEvent.create({
            data: {
                requestId: id, action: "CANCELLED", actorId: s.uid, actorKind: "CUSTOMER"
            }
        });
    });
}
export async function downloadExport(db: PrismaClient, s: FacilitySession, id: string) {
    if (!z.uuid().safeParse(id).success)
        deny("Request not found.");
    return db.$transaction(async (tx) => {
        await lockCustomer(tx, s);
        const r = await lockRequest(tx, id);
        if (r.facilityId !== s.facilityId || r.requesterId !== s.uid)
            deny("Request not found.");
        if (r.status !== "APPROVED" || !r.expiresAt || +r.expiresAt <= Date.now() || r.manifestVersion !== 1)
            deny("An unexpired OWNER approval is required.");
        const plan = await scope(tx, s, r);
        const valueCount = await tx.operationalEvidenceFieldValue.count({
            where: {
                record: plan.where, fieldType: {
                    notIn: ["PHOTO", "FILE", "SIGNATURE"]
                }
            }
        });
        if (valueCount > 50000)
            deny("This report exceeds 50,000 responses. Choose a smaller date range.");
        const records = await tx.operationalEvidenceRecord.findMany({
            where: plan.where, orderBy: [{
                    operationalDate: "asc"
                }, {
                    id: "asc"
                }], select: {
                id: true, catalogDefinitionId: true, templateStableKey: true, templateVersion: true, operationalDate: true, placeLabelSnapshot: true, recordedAt: true, recordedByLabel: true, status: true, outOfStandard: true, correctiveActionText: true, templateSnapshotJson: true, values: {
                    where: {
                        fieldType: {
                            notIn: ["PHOTO", "FILE", "SIGNATURE"]
                        }
                    }, orderBy: [{
                            fieldKey: "asc"
                        }, {
                            groupKey: "asc"
                        }, {
                            rowKey: "asc"
                        }], select: {
                        fieldKey: true, fieldType: true, groupKey: true, rowKey: true, valueText: true, valueNumber: true, valueBoolean: true, valueDateTime: true, valueSelections: true
                    }
                }
            }
        });
        const { renderRequestedReport } = await import("./render");
        const artifact = await renderRequestedReport(r, plan.facility.displayName, plan.department.name, records);
        await requireExportCustomer(tx, s);
        if (+r.expiresAt <= Date.now())
            deny("Approval expired during generation. Submit a new request.");
        await tx.customerRecordExportEvent.create({
            data: {
                requestId: id, action: "GENERATED", actorId: s.uid, actorKind: "CUSTOMER", artifactHash: hash(artifact.bytes), byteCount: artifact.bytes.length, recordCount: records.length
            }
        });
        return artifact;
    }, {
        isolationLevel: "ReadCommitted", timeout: 30000
    });
}
export async function listCustomerExports(db: PrismaClient, s: FacilitySession, page = 1) {
    return db.$transaction(async (tx) => {
        await requireExportCustomer(tx, s);
        const where = {
            facilityId: s.facilityId, requesterId: s.uid
        };
        const total = await tx.customerRecordExportRequest.count({
            where
        });
        const current = Math.max(1, Math.min(Math.ceil(total / 25) || 1, page));
        const rows = await tx.customerRecordExportRequest.findMany({
            where, orderBy: [{
                    createdAt: "desc"
                }, {
                    id: "desc"
                }], skip: (current - 1) * 25, take: 25, select: {
                id: true, departmentId: true, recordKey: true, fromDate: true, toDate: true, format: true, status: true, expiresAt: true, createdAt: true
            }
        });
        await requireExportCustomer(tx, s);
        return {
            rows, total, page: current, pages: Math.ceil(total / 25) || 1
        };
    });
}
export async function listOwnerExports(db: PrismaClient, s: HarborJwtPayload, page = 1) {
    return db.$transaction(async (tx) => {
        const a = await lockHarborStaffSession(s, tx);
        if (!a.valid || a.staff.role !== "OWNER")
            deny("OWNER sign-in required.");
        const total = await tx.customerRecordExportRequest.count();
        const current = Math.max(1, Math.min(Math.ceil(total / 25) || 1, page));
        const rows = await tx.customerRecordExportRequest.findMany({
            orderBy: [{
                    createdAt: "desc"
                }, {
                    id: "desc"
                }], skip: (current - 1) * 25, take: 25, select: {
                id: true, facilityId: true, requesterId: true, requesterLabel: true, dataList: true, departmentId: true, recordKey: true, fromDate: true, toDate: true, format: true, status: true, revision: true, expiresAt: true, createdAt: true
            }
        });
        const facilities = await tx.facility.findMany({
            where: {
                id: {
                    in: rows.map(row => row.facilityId)
                }
            }, select: {
                id: true, displayName: true
            }
        });
        const departments = await tx.department.findMany({
            where: {
                id: {
                    in: rows.map(row => row.departmentId)
                }
            }, select: {
                id: true, facilityId: true, name: true
            }
        });
        return {
            rows: rows.map(row => ({
                ...row, facilityName: facilities.find(f => f.id === row.facilityId)?.displayName ?? "Unavailable Facility", departmentName: departments.find(d => d.id === row.departmentId && d.facilityId === row.facilityId)?.name ?? "Unavailable Department"
            })), total, page: current, pages: Math.ceil(total / 25) || 1
        };
    });
}
