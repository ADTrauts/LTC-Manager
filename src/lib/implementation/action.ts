import type { Actor } from "./authority";
import { prisma } from "@/lib/prisma";
import { resolveRequestOrigin } from "@/lib/billing/request-origin";
import { prepareImplementationPayment, reconcileImplementationPayment } from "@/lib/billing/implementation-payment";
import { addParticipant, approveQuote, assignEngagement, acceptHandoff, issueQuote, linkImport, receiveSource, recordDelivery, recordMappingDecision, requestEngagement } from "./service";
import { authorize, lockEngagement } from "./authority";
import { ensureFacilityStripeCustomer } from "@/lib/billing/stripe-customer";
import { isStripeSecretConfigured } from "@/lib/stripe";
import { requestFailedSupportAttachmentRescan } from "@/lib/support/scan-pending-attachments";
import { ImplementationError } from "./contract";
export type ActionResult = { ok: true; message: string; engagementId?: string; url?: string | null } | { ok: false; error: string };
export async function performImplementationAction(actor: Actor, data: FormData): Promise<ActionResult> {
  const facilityId = String(data.get("expectedFacilityId"));
  await authorize(prisma,actor,facilityId);
  const command = String(data.get("command")); const id = String(data.get("engagementId"));
  if (command !== "request") {
    const ref = await prisma.implementationEngagement.findUnique({ where: { id }, select: { facilityId: true } });
    if (!ref || ref.facilityId !== facilityId) throw new ImplementationError("Facility or engagement changed. Reload the intended workspace.");
  }
  const scope = () => ({ departmentKeys: data.getAll("departmentKey").map(String), deliverables: String(data.get("deliverables") || "").split("\n").map(s => s.trim()).filter(Boolean) });
  if (command === "request") return { ok: true, message: "Engagement requested. No file, configuration or charge has been authorized.", engagementId: await requestEngagement(prisma,actor,facilityId,scope()) };
  if (command === "assign") await assignEngagement(prisma,actor,id,String(data.get("responsibleStaffId")));
  else if (command === "participant") await addParticipant(prisma,actor,id,String(data.get("userId")));
  else if (command === "quote") await issueQuote(prisma,actor,id,Number(data.get("revision")),scope(),String(data.get("waiverReason") || "") || undefined);
  else if (command === "approve") {
    if (data.get("approveScope") !== "yes") throw new ImplementationError("Explicitly confirm this exact scope and one-time price.");
    await approveQuote(prisma,actor,id,String(data.get("orderId")),String(data.get("digest")));
  }
  else if (command === "delivery") await recordDelivery(prisma,actor,id,{ stage: String(data.get("stage")), disposition: String(data.get("disposition")), notes: String(data.get("notes")) });
  else if (command === "mapping") await recordMappingDecision(prisma,actor,id,String(data.get("notes")),String(data.get("sourceMessageId") || "") || null);
  else if (command === "share") {
    if (data.get("shareConsent") !== "yes") throw new ImplementationError("Confirm sharing your receipt results with recorded engagement participants.");
    await linkImport(prisma,actor,id,String(data.get("batchId")));
  }
  else if (command === "rescan") {
    if (actor.kind !== "staff") throw new ImplementationError("Original security rescans require Console staff.");
    const view = await import("./service").then(m => m.getEngagement(prisma,actor,id));
    const attachmentId = String(data.get("attachmentId"));
    if (!view.attachments.some(a => a.id === attachmentId)) throw new ImplementationError("Choose this engagement's source attachment.");
    await requestFailedSupportAttachmentRescan(prisma,actor.session,attachmentId,String(data.get("reason")));
    return { ok: true, message: "Rescan explicitly queued as PENDING. The asynchronous support processor must complete a real scan before download." };
  }
  else if (command === "source") {
    const file = data.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10*1024*1024) throw new ImplementationError("Choose an existing source file up to 10 MB. Upload grants no import consent.");
    const result = await receiveSource(prisma,actor,id,{ submissionId: String(data.get("submissionId")), filename: file.name, contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return { ok: true, message: result.attachments.map(a => `${a.filename}: ${a.rejectionReason ?? a.scanStatus}`).join("; ")+". Pending files are quarantined; blocked files require a corrected file or configured private storage. No operational data changed." };
  }
  else if (command === "accept") {
    if (data.get("acceptHandoff") !== "yes") throw new ImplementationError("Confirm that you reviewed both delivered work and deferred items.");
    await acceptHandoff(prisma,actor,id,String(data.get("fingerprint")));
  }
  else if (command === "configureBilling") {
    if (actor.kind !== "customer") throw new ImplementationError("Customer billing action required.");
    if (!isStripeSecretConfigured()) throw new ImplementationError("Stripe is not configured here. No billing customer, subscription or charge was created.");
    await prisma.$transaction(async tx => {
      const engagement = await lockEngagement(tx,actor,id);
      const facility = await tx.facility.findUniqueOrThrow({ where: { id: engagement.facilityId } });
      await ensureFacilityStripeCustomer({ ...facility, facilityId: facility.id, fallbackEmail: actor.session.email },{ tx });
    },{ timeout: 25000, maxWait: 30000 });
    return { ok: true, message: "Canonical Facility billing customer configured. No subscription or charge created. You can now pay the approved one-time service order." };
  }
  else if (command === "pay" || command === "reconcile") {
    if (!isStripeSecretConfigured()) throw new ImplementationError("Stripe is not configured here. Your approved scope is retained. No provider request or charge was made.");
    const orderId = String(data.get("orderId"));
    if (command === "pay") await prepareImplementationPayment({ db: prisma },actor,id,orderId,String(data.get("digest")),await resolveRequestOrigin(),`/admin/billing/implementation?engagement=${encodeURIComponent(id)}`);
    const result = await reconcileImplementationPayment({ db: prisma },actor,id,orderId,command === "pay");
    return { ok: true, message: `Payment: ${result.status}. ${"message" in result ? result.message ?? "" : ""} Reconcile before any retry. No subscription access changes.`, url: actor.kind === "customer" ? result.url : null };
  }
  else throw new ImplementationError("Unknown service action.");
  return { ok: true, message: "Saved. Review the current scope, evidence and results." };
}
