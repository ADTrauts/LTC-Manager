import { ImplementationWorkspace } from "@/components/implementation-workspace";
import { consoleActor } from "@/lib/implementation/request-actor";
import { authorize } from "@/lib/implementation/authority";
import { getEngagement } from "@/lib/implementation/service";
import { listDepartmentProducts, isDepartmentProductOfferedForSale } from "@/lib/department-products";
import { prisma } from "@/lib/prisma";
import { implementationStaffAction } from "./actions";
export default async function ConsoleImplementationPage({ params, searchParams }: { params: Promise<{ facilityId: string }>; searchParams: Promise<{ engagement?: string }> }) {
  const actor = await consoleActor(); const { facilityId } = await params;
  if (actor.kind !== "staff") throw new Error("Console session required.");
  if (actor.workFacilityId) return <section className="mx-auto max-w-3xl space-y-4"><h1 className="text-2xl font-semibold">VSSYL implementation</h1><p role="alert">Exit the Facility work session before managing implementation engagements. Execution remains in the canonical Build tools.</p><form action="/api/console/work-session/end" method="post"><button className="min-h-11 rounded border p-3">Exit Facility work session</button></form></section>;
  await authorize(prisma,actor,facilityId);
  const query = await searchParams;
  const [facility,engagements,staffOptions] = await Promise.all([prisma.facility.findUniqueOrThrow({ where: { id: facilityId }, select: { displayName: true } }),prisma.implementationEngagement.findMany({ where: { facilityId }, orderBy: { createdAt: "desc" }, select: { id: true, responsibleStaffId: true, acceptedAt: true } }),prisma.platformStaff.findMany({ where: { isActive: true }, select: { id: true, displayName: true } })]);
  let selected = null; let error: string | undefined;
  if (query.engagement) { try { selected = await getEngagement(prisma,actor,query.engagement); if (selected.facilityId !== facilityId) { selected = null; error = "Engagement is in another Facility."; } } catch { error = "Claim or obtain explicit participation before reading this engagement. Active work sessions must be exited."; } }
  return <ImplementationWorkspace key={`${actor.session.uid}:${facilityId}:${selected?.id ?? "list"}`} facilityId={facilityId} facilityName={facility.displayName} staff owner={actor.session.staffRole === "OWNER"} actorId={actor.session.uid} action={implementationStaffAction} engagements={engagements.map(e => ({ ...e, accepted: !!e.acceptedAt }))} selected={selected} selectedId={engagements.some(e => e.id === query.engagement) ? query.engagement : undefined} products={listDepartmentProducts().filter(isDepartmentProductOfferedForSale).map(p => ({ key: p.installationKey, name: p.name }))} staffOptions={staffOptions} error={error} />;
}
