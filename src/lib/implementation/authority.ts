import { Prisma, type PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { lockHarborStaffSession, validateHarborStaffSession } from "@/lib/harbor-console/auth";
import type { HarborJwtPayload } from "@/lib/harbor-console/session";
import { lockAuthority, liveActor } from "@/lib/setup-imports/authority";
import { ImplementationError } from "./contract";
export type Actor = { kind: "customer"; session: FacilitySession } | { kind: "staff"; session: HarborJwtPayload; workFacilityId: string | null };
export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;
export function actorFields(actor: Actor) { return { actorKind: actor.kind, actorUserId: actor.kind === "customer" ? actor.session.uid : null, actorStaffId: actor.kind === "staff" ? actor.session.uid : null }; }
export async function authorize(db: Db, actor: Actor, facilityId: string, lock = false) {
  if (actor.kind === "customer") {
    if (actor.session.authKind !== "user" || actor.session.facilityId !== facilityId) throw new ImplementationError("Use the intended Facility Administrator account.");
    if (lock) await lockAuthority(db as Tx,actor.session,"workforce"); else await liveActor(db,actor.session,facilityId,"workforce");
  } else {
    await authorizeImplementationStaff(db, actor, lock);
  }
}

export async function authorizeImplementationStaff(db: Db, actor: Actor, lock = false) {
  if (actor.kind !== "staff") throw new ImplementationError("Console staff action is required.");
  if (actor.workFacilityId) throw new ImplementationError("Exit the Facility work session before managing implementation engagements.");
  const authority = lock ? await lockHarborStaffSession(actor.session, db as Tx) :
    await validateHarborStaffSession(actor.session, db);
  if (!authority.valid) throw new ImplementationError("Console authority changed. Sign in again.");
}
export async function lockEngagement(tx: Tx, actor: Actor, id: string, participant = true) {
  // Facility lock is shared with imports and billing. Lock order is authority → Facility → engagement.
  const ref = await tx.implementationEngagement.findUniqueOrThrow({ where: { id } });
  await authorize(tx,actor,ref.facilityId,true);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id"=${ref.facilityId} FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ImplementationEngagement" WHERE "id"=${id} FOR UPDATE`);
  const row = await tx.implementationEngagement.findUniqueOrThrow({ where: { id } });
  // Effective role periods may expire while locks wait, without any row mutation.
  await authorize(tx,actor,row.facilityId);
  if (participant) await requireParticipant(tx,actor,id);
  return row;
}
export async function requireParticipant(db: Db, actor: Actor, engagementId: string) {
  const member = await db.implementationParticipant.findFirst({ where: { engagementId, ...(actor.kind === "customer" ? { userId: actor.session.uid } : { staffId: actor.session.uid }) } });
  if (!member) throw new ImplementationError("This engagement requires explicitly recorded participation.");
}
export async function appendEvent(tx: Tx, actor: Actor, engagementId: string, kind: string, data: Prisma.InputJsonValue) {
  return tx.implementationEvent.create({ data: { engagementId, kind, ...actorFields(actor), data } });
}
