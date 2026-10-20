import { ImplementationWorkspace } from "@/components/implementation-workspace";
import { customerActor } from "@/lib/implementation/request-actor";
import { authorize } from "@/lib/implementation/authority";
import { getEngagement } from "@/lib/implementation/service";
import { listDepartmentProducts, isDepartmentProductOfferedForSale } from "@/lib/department-products";
import { prisma } from "@/lib/prisma";
import { implementationCustomerAction } from "./actions";
import { reconcileImplementationPayment } from "@/lib/billing/implementation-payment";
export default async function ImplementationPage({ searchParams }: { searchParams: Promise<{ engagement?: string; payment?: string }> }) {
  const actor = await customerActor();
  if (actor.kind !== "customer") throw new Error("Customer session required.");
  const facilityId = actor.session.facilityId;
  await authorize(prisma,actor,facilityId);
  const query = await searchParams;
  const [facility,engagements] = await Promise.all([prisma.facility.findUniqueOrThrow({ where: { id: facilityId }, select: { displayName: true } }),prisma.implementationEngagement.findMany({ where: { facilityId, participants: { some: { userId: actor.session.uid } } }, orderBy: { createdAt: "desc" }, select: { id: true, responsibleStaffId: true, acceptedAt: true } })]);
  let selected = null; let error: string | undefined;
  if (query.engagement) {
    try {
      selected = await getEngagement(prisma,actor,query.engagement);
      if (query.payment && selected.orders[0]?.status === "APPROVED") {
        const result = await reconcileImplementationPayment({ db: prisma },actor,selected.id,selected.orders[0].id);
        if (result.status === "UNKNOWN") error = "Provider outcome remains unknown. Reconcile the stored attempt before retrying.";
        selected = await getEngagement(prisma,actor,selected.id);
      }
    } catch { error = "Engagement could not be read or reconciled in this Facility/session. Reload before retrying."; }
  }
  return <ImplementationWorkspace key={`${actor.session.uid}:${facilityId}:${selected?.id ?? "list"}`} facilityId={facilityId} facilityName={facility.displayName} staff={false} actorId={actor.session.uid} action={implementationCustomerAction} engagements={engagements.map(e => ({ ...e, accepted: !!e.acceptedAt }))} selected={selected} products={listDepartmentProducts().filter(isDepartmentProductOfferedForSale).map(p => ({ key: p.installationKey, name: p.name }))} error={error} />;
}
