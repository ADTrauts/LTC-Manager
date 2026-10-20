import { z } from "zod";
export const PROTOCOL = "space/1" as const;
export const LIMITS = { leaseMs: 12 * 3600000, proofMs: 300000, bundleBytes: 524288, targets: 250, envelopes: 8, commands: 200, storeBytes: 2097152, commandBytes: 8192, batch: 20, requestBytes: 196608 } as const;
export const scopeSchema = z.object({ facilityId: z.string().cuid(), departmentId: z.string().cuid(), unitId: z.string().cuid(), spaceId: z.string().cuid() }).strict();
export type SpaceScope = z.infer<typeof scopeSchema>;
export const commandSchema = z.object({ id: z.string().uuid(), issuanceId: z.string().cuid(), kind: z.enum(["WORK", "KEY_TIME_ACTUAL"]), target: z.string().min(1).max(1000), baseline: z.string().length(64), occurredAt: z.string().datetime(), note: z.string().max(1000).default("") }).strict();
export type SpaceCommand = z.infer<typeof commandSchema>;
export const requestSchema = z.discriminatedUnion("action", [
    z.object({ protocol: z.literal(PROTOCOL), action: z.literal("prepare"), scope: scopeSchema }).strict(),
    z.object({ protocol: z.literal(PROTOCOL), action: z.literal("recover"), issuanceId: z.string().cuid(), review: z.literal(true), digest: z.string().length(64) }).strict(),
    z.object({ protocol: z.literal(PROTOCOL), action: z.literal("sync"), commands: z.array(commandSchema).min(1).max(LIMITS.batch), reviewedExpired: z.boolean().default(false) }).strict(),
    z.object({ protocol: z.literal(PROTOCOL), action: z.literal("reconcile"), commands: z.array(commandSchema).min(1).max(LIMITS.batch) }).strict(),
]);
export type SpaceRequest = z.infer<typeof requestSchema>;
export type Outcome = {
    id: string;
    status: "committed" | "reused" | "blocked" | "conflict" | "failed" | "unknown";
    message: string;
    recordId?: string;
};
export type Target = {
    kind: SpaceCommand["kind"];
    id: string;
    label: string;
    instructions?: string | null;
    baseline: string;
    completed: boolean;
    available: boolean;
    unavailableReason?: string;
};
export type SpaceBundle = {
    protocol: typeof PROTOCOL;
    issuanceId: string;
    scope: SpaceScope;
    actorRef: string;
    sessionVersion: number;
    operationalDate: string;
    issuedAt: string;
    expiresAt: string;
    label: string;
    timezone: string;
    targets: Target[];
    reviewDigest: string;
};
