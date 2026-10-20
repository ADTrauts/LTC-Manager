import { randomUUID } from "node:crypto";
import { Prisma, type ImplementationOrder, type ImplementationPaymentAttempt, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { getStripeServerClient } from "@/lib/stripe";
import { appendEvent, authorize, lockEngagement, type Actor, type Tx } from "@/lib/implementation/authority";
import { ImportError } from "@/lib/setup-imports/contract";
import { ImplementationError } from "@/lib/implementation/contract";

export type PaymentDependencies = { db: PrismaClient; stripe?: Stripe; now?: () => Date };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const options = { timeout: 10000, maxNetworkRetries: 0 };
const txOptions = { timeout: 30000, maxWait: 30000 };
const nowOf = (deps: PaymentDependencies) => deps.now?.() ?? new Date();
export const IMPLEMENTATION_PAYMENT_KIND = "implementation_order";
async function lockOrder(tx: Tx, orderId: string) {
  const ref = await tx.implementationOrder.findUniqueOrThrow({ where: { id: orderId }, include: { engagement: true } });
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id"=${ref.engagement.facilityId} FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ImplementationEngagement" WHERE "id"=${ref.engagementId} FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ImplementationOrder" WHERE "id"=${orderId} FOR UPDATE`);
  return tx.implementationOrder.findUniqueOrThrow({ where: { id: orderId }, include: { engagement: true } });
}
function payable(order: ImplementationOrder) {
  if (!order.approvedAt || !order.approvedByUserId || order.amountCents <= 0 || !["APPROVED","PAID"].includes(order.status)) throw new ImplementationError("Approve the current non-waived scope before payment.");
}
function checkSession(order: ImplementationOrder, attempt: ImplementationPaymentAttempt, session: Stripe.Checkout.Session) {
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (session.mode !== "payment" || session.subscription || customerId !== attempt.customerId || session.client_reference_id !== order.id || session.metadata?.kind !== IMPLEMENTATION_PAYMENT_KIND || session.metadata?.orderId !== order.id || session.metadata?.attemptId !== attempt.id || session.metadata?.scopeDigest !== order.digest || session.currency !== order.currency || session.amount_total !== order.amountCents || (attempt.checkoutSessionId && attempt.checkoutSessionId !== session.id)) {
    throw new ImplementationError("Provider scope, customer or amount does not match the approved service order. No additional charge will be created.");
  }
}
async function applySession(tx: Tx, order: ImplementationOrder, attempt: ImplementationPaymentAttempt, session: Stripe.Checkout.Session, stripe: Stripe) {
  checkSession(order,attempt,session);
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  let status = session.status === "open" ? "OPEN" : "UNKNOWN";
  if (session.status === "complete" && session.payment_status === "paid" && paymentIntentId) status = "PAID";
  else if (session.status === "expired" && session.payment_status === "unpaid") {
    // New attempt is safe only when no previous intent can still settle.
    const intent = paymentIntentId ? await stripe.paymentIntents.retrieve(paymentIntentId,{},options) : null;
    if (!intent || intent.status === "canceled") status = "EXPIRED";
  }
  // A late event cannot undo a settled payment. Every event retrieves current state first.
  if (attempt.status === "PAID" && status !== "PAID") throw new ImplementationError("A settled service payment needs billing review; its delivered history is preserved.");
  await tx.implementationPaymentAttempt.update({ where: { id: attempt.id }, data: { status, checkoutSessionId: session.id, paymentIntentId, checkoutUrl: status === "OPEN" ? session.url : null } });
  if (status === "PAID" && order.status !== "PAID") {
    await tx.implementationOrder.update({ where: { id: order.id }, data: { status: "PAID" } });
    await tx.implementationEvent.create({ data: { engagementId: order.engagementId, kind: "PAYMENT_SETTLED", actorKind: "provider", data: { orderId: order.id, attemptId: attempt.id, sessionId: session.id, paymentIntentId, amountCents: order.amountCents, currency: order.currency } } });
  }
  return { status, url: status === "OPEN" ? session.url : null, sessionId: session.id };
}
/** List reconciliation is paginated and complete. A failed/incomplete scan never permits POST. */
async function findAttemptSession(stripe: Stripe, attempt: ImplementationPaymentAttempt) {
  if (attempt.checkoutSessionId) return stripe.checkout.sessions.retrieve(attempt.checkoutSessionId,{},options);
  const matches: Stripe.Checkout.Session[] = [];
  let starting_after: string | undefined;
  for (let page = 0; page < 100; page++) {
    const list = await stripe.checkout.sessions.list({ customer: attempt.customerId, created: { gte: Math.floor(+attempt.createdAt/1000)-60 }, limit: 100, ...(starting_after ? { starting_after } : {}) },options);
    matches.push(...list.data.filter(s => s.metadata?.attemptId === attempt.id));
    if (!list.has_more) {
      if (matches.length > 1) throw new ImplementationError("Multiple provider sessions match this attempt. Billing review is required before retry.");
      return matches[0] ? stripe.checkout.sessions.retrieve(matches[0].id,{},options) : null;
    }
    if (!list.data.length) break;
    starting_after = list.data.at(-1)!.id;
  }
  throw new ImplementationError("Provider history could not be completely reconciled. Retry reconciliation; no checkout was created.");
}
export async function prepareImplementationPayment(deps: PaymentDependencies, actor: Actor, engagementId: string, orderId: string, expectedDigest: string, origin: string, returnPath: string) {
  if (actor.kind !== "customer") throw new ImplementationError("Only the customer may initiate a service payment.");
  if (!/^https?:\/\//.test(origin) || !returnPath.startsWith("/admin/billing/implementation") || returnPath.includes("//")) throw new ImplementationError("Invalid payment return destination.");
  return deps.db.$transaction(async tx => {
    const engagement = await lockEngagement(tx,actor,engagementId);
    const order = await lockOrder(tx,orderId); payable(order);
    if (order.engagementId !== engagement.id || order.revision !== engagement.revision || order.digest !== expectedDigest) throw new ImplementationError("Scope changed. Review the approved service order.");
    if (order.status === "PAID") return { orderId, paid: true };
    const previous = await tx.implementationPaymentAttempt.findFirst({ where: { orderId }, orderBy: { sequence: "desc" } });
    if (previous && previous.status !== "EXPIRED") return { orderId, paid: false };
    const facility = await tx.facility.findUniqueOrThrow({ where: { id: engagement.facilityId }, select: { stripeCustomerId: true } });
    if (!facility.stripeCustomerId) throw new ImplementationError("Configure the Facility billing customer using Manage billing first. A service payment does not create another subscription.");
    const id = randomUUID();
    const request: Stripe.Checkout.SessionCreateParams = {
      mode: "payment", customer: facility.stripeCustomerId, client_reference_id: order.id,
      payment_method_types: ["card"],
      line_items: [{ quantity: 1, price_data: { currency: order.currency, unit_amount: order.amountCents, product_data: { name: `VSSYL implementation — engagement ${engagement.id}, scope revision ${order.revision}` } } }],
      success_url: `${origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}payment=return`, cancel_url: `${origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}payment=canceled`,
      metadata: { kind: IMPLEMENTATION_PAYMENT_KIND, orderId: order.id, attemptId: id, scopeDigest: order.digest, facilityId: engagement.facilityId },
      payment_intent_data: { metadata: { kind: IMPLEMENTATION_PAYMENT_KIND, orderId: order.id, attemptId: id, scopeDigest: order.digest, facilityId: engagement.facilityId } },
    };
    await tx.implementationPaymentAttempt.create({ data: { id, orderId, sequence: (previous?.sequence ?? 0)+1, idempotencyKey: `implementation-${id}`, request: json(request), customerId: facility.stripeCustomerId, createdAt: nowOf(deps) } });
    await appendEvent(tx,actor,engagement.id,"PAYMENT_REQUESTED",{ orderId, attemptId: id, digest: order.digest });
    return { orderId, paid: false };
  },txOptions);
}
/** Called after durable prepare. Locks span check/provider call/receipt. A crash leaves the exact request recoverable. */
export async function reconcileImplementationPayment(deps: PaymentDependencies, actor: Actor, engagementId: string, orderId: string, allowSameKeyRetry = false) {
  const stripe = deps.stripe ?? getStripeServerClient();
  return deps.db.$transaction(async tx => {
    const engagement = await lockEngagement(tx,actor,engagementId);
    const order = await lockOrder(tx,orderId);
    if (order.engagementId !== engagement.id) throw new ImplementationError("Order is outside this engagement.");
    payable(order);
    if (order.status === "PAID") return { status: "PAID", url: null };
    const attempt = await tx.implementationPaymentAttempt.findFirst({ where: { orderId }, orderBy: { sequence: "desc" } });
    if (!attempt) return { status: "NOT_STARTED", url: null };
    let session: Stripe.Checkout.Session | null;
    try {
      session = await findAttemptSession(stripe,attempt);
      if (!session && allowSameKeyRetry && actor.kind === "customer" && +nowOf(deps)-+attempt.createdAt < 12*60*60*1000) {
        // Stripe v1 keys may be pruned after 24h. Never replay a creation beyond our conservative 12h bound.
        await authorize(tx,actor,engagement.facilityId);
        session = await stripe.checkout.sessions.create(attempt.request as unknown as Stripe.Checkout.SessionCreateParams,{ ...options, idempotencyKey: attempt.idempotencyKey });
      }
      if (!session) {
        await tx.implementationPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "UNKNOWN" } });
        return { status: "UNKNOWN", url: null };
      }
      checkSession(order,attempt,session);
    } catch (error) {
      if (error instanceof ImportError) throw error; // Authority failure before POST is not a provider outcome.
      // No fresh key after an ambiguous response, failed reconciliation, mismatch or SDK error.
      await tx.implementationPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "UNKNOWN", checkoutUrl: null } });
      return { status: "UNKNOWN", url: null, message: error instanceof ImplementationError ? error.message : "Payment outcome is unknown. Reconcile this stored attempt before retrying; no new order or charge was created by this recovery." };
    }
    // Persistence failure must roll back the entire settlement, including its audit.
    // Do not turn a partially applied local settlement into a committed UNKNOWN row.
    return applySession(tx,order,attempt,session,stripe);
  },txOptions);
}
/** Signed webhook dispatcher supplies only a locator. Current Stripe state and the approved snapshot are proof. */
export async function handleImplementationCheckout(deps: PaymentDependencies, locator: Stripe.Checkout.Session): Promise<boolean> {
  if (locator.metadata?.kind !== IMPLEMENTATION_PAYMENT_KIND) return false;
  const orderId = locator.metadata.orderId;
  const stripe = deps.stripe ?? getStripeServerClient();
  const session = await stripe.checkout.sessions.retrieve(locator.id,{},options);
  await deps.db.$transaction(async tx => {
    const order = await lockOrder(tx,orderId); payable(order);
    const attempt = await tx.implementationPaymentAttempt.findUniqueOrThrow({ where: { id: session.metadata?.attemptId ?? "" } });
    if (attempt.orderId !== order.id) throw new ImplementationError("Webhook attempt does not belong to this service order.");
    await applySession(tx,order,attempt,session,stripe);
  },txOptions);
  return true;
}
