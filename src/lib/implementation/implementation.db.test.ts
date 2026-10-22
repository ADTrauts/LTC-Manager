import { traceDisposableTransactions } from "@/lib/verify/trace-disposable-transactions";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, RoleKey } from "@prisma/client";
import type Stripe from "stripe";
import type { FacilitySession } from "@/lib/auth";
import type { HarborJwtPayload } from "@/lib/harbor-console/session";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { applyFacilitySubscription } from "@/lib/billing/apply-stripe-event";
import { previewImport, confirmImport, getImportResults } from "@/lib/setup-imports/service";
import type { Dataset, Preview } from "@/lib/setup-imports/contract";
import { requestEngagement, addParticipant, assignEngagement, issueQuote, approveQuote, recordDelivery, recordMappingDecision, receiveSource, linkImport, sharedResults, reviewHandoff, acceptHandoff, getEngagement } from "./service";
import { STAGES } from "./contract";
import type { Actor } from "./authority";
import { prepareImplementationPayment, reconcileImplementationPayment, handleImplementationCheckout } from "@/lib/billing/implementation-payment";
import { handleStripeBillingEvent } from "@/lib/billing/webhook-handlers";
import { createMemorySupportAttachmentStore } from "@/lib/support/attachment-store";
const url=process.env.ONBOARDING_TEST_DATABASE_URL;if(url)assertDisposableDatabaseUrl(url);const skip=!url;
process.env.AUTH_SECRET ||= "onb05-test-secret";
async function run(body:(db:PrismaClient)=>Promise<void>){const db=traceDisposableTransactions(new PrismaClient({datasources:{db:{url:url!}}}),"implementation");try{await body(db);}finally{await db.$disconnect();}}
async function fixture(db: PrismaClient, organizationId?: string) {
  const id = randomUUID();
  for (const key of Object.values(RoleKey)) await db.role.upsert({ where: { key }, create: { key, name: key }, update: {} });
  const role = await db.role.findUniqueOrThrow({ where: { key: "FACILITY_ADMINISTRATOR" } });
  const org = organizationId ? { id: organizationId } : await db.organization.create({ data: { name: `ONB05 ${id}`, organizationType: "LONG_TERM_CARE" } });
  const facility = await db.facility.create({ data: { organizationId: org.id, displayName: `ONB05 ${id}`, timezone: "America/New_York" } });
  await applyFacilitySubscription({ facilityId: facility.id, status: "ACTIVE", departmentKeys: ["DIETARY","PLANT"] },db);
  const departments = await db.department.findMany({ where: { facilityId: facility.id } });
  const dietary = departments.find(d => d.key === "DIETARY")!, plant = departments.find(d => d.key === "PLANT")!;
  const user = await db.user.create({ data: { email: `admin-${id}@example.com`, displayName: "Setup Administrator", facilityId: facility.id, primaryDepartmentId: plant.id, roleId: role.id, passwordHash: "existing-admin-password", emailVerifiedAt: new Date() } });
  const grant = await db.userFacilityAccess.create({ data: { userId: user.id, facilityId: facility.id, rolePeriods: { create: { roleKey: "FACILITY_ADMINISTRATOR", startsAt: new Date("2020-01-01") } } } });
  await db.employee.create({ data: { facilityId: facility.id, userId: user.id, email: user.email, firstName: "Setup", lastName: "Administrator", roleType: "FACILITY_ADMINISTRATOR", employmentType: "FULL_TIME", status: "ACTIVE", primaryDepartmentId: plant.id } });
  const session = { uid: user.id, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", role: "FACILITY_ADMINISTRATOR", facilityId: facility.id, primaryDepartmentId: plant.id, name: user.displayName, email: user.email, sessionVersion: 0 } as FacilitySession;
  const floor = await db.unit.create({ data: { facilityId: facility.id, name: "Floor 1", unitType: "OTHER", hierarchyRole: "FLOOR" } });
  const unit = await db.unit.create({ data: { facilityId: facility.id, name: "Shared Wing", unitType: "OTHER", hierarchyRole: "NEIGHBORHOOD", parentUnitId: floor.id } });
  const room = await db.unitSpace.create({ data: { facilityId: facility.id, unitId: unit.id, name: "Shared Room", spaceType: "SERVICE_AREA" } });
  const preview = (dataset: Dataset,text: string) => previewImport(db,session,{ dataset,text,fileName: `${dataset}.csv`,expectedFacilityId: facility.id });
  const confirm = (p: Preview,text?: string,accounts: number[] = []) => confirmImport(db,session,{ reviewToken: p.reviewToken, expectedFacilityId: facility.id, text, fileName: text === undefined ? undefined : p.fileName, confirmedAccountRows: accounts });
  const email = `worker-${id}@example.com`;
  const workforce = (target = email, extra = "") => `email,firstName,lastName,roleType,employmentType,primaryDepartment${extra ? ","+extra.split("\n")[0] : ""}\n${target},Casey,Worker,STAFF,PART_TIME,DIETARY${extra ? ","+extra.split("\n")[1] : ""}\n`;
  return { org,facility,user,grant,session,dietary,plant,floor,unit,room,email,preview,confirm,workforce };
}

async function setup(db: PrismaClient, waived=false) {
  const f=await fixture(db);const owner=await db.platformStaff.create({data:{email:`owner-${randomUUID()}@example.com`,displayName:"Service Owner",passwordHash:"no-login",role:"OWNER"}});
  const c:Actor={kind:"customer",session:f.session};const s:Actor={kind:"staff",session:{uid:owner.id,staffRole:owner.role,email:owner.email,name:owner.displayName,sessionVersion:0,tokenUse:"harbor"} as HarborJwtPayload,workFacilityId:null};
  const scope={departmentKeys:["DIETARY","PLANT"],deliverables:["Workforce mapping and reviewed results","Configuration review and training"]};
  const id=await requestEngagement(db,c,f.facility.id,scope);await assignEngagement(db,s,id,owner.id);const order=await issueQuote(db,s,id,0,scope,waived?"Owner-approved service recovery":undefined);
  return {...f,c,s,owner,scope,id,order};
}
function provider(){
  const sessions=new Map<string,Stripe.Checkout.Session>(),keys=new Map<string,string>();let creates=0,failAfterCreate=false,failList=false;
  const stripe={checkout:{sessions:{list:async()=>{if(failList)throw Error("provider unavailable");return {data:[...sessions.values()],has_more:false};},retrieve:async(id:string)=>{const s=sessions.get(id);if(!s)throw Error("missing");return s;},create:async(req:Stripe.Checkout.SessionCreateParams,options:{idempotencyKey:string})=>{
    const existing=keys.get(options.idempotencyKey);if(existing)return sessions.get(existing)!;
    creates++;const id=`cs_${randomUUID()}`;const s={id,mode:req.mode,customer:req.customer,client_reference_id:req.client_reference_id,metadata:req.metadata,currency:"usd",amount_total:req.line_items![0]!.price_data!.unit_amount,payment_status:"unpaid",status:"open",url:`https://checkout.stripe.com/${id}`,payment_intent:null,subscription:null} as Stripe.Checkout.Session;sessions.set(id,s);keys.set(options.idempotencyKey,id);if(failAfterCreate)throw Error("response lost after Stripe accepted");return s;
  }}},paymentIntents:{retrieve:async()=>({status:"canceled"})}} as unknown as Stripe;
  return {stripe,sessions,get creates(){return creates;},loseResponse(){failAfterCreate=true;},listFailure(){failList=true;},paid(){const s=[...sessions.values()][0]!;s.status="complete";s.payment_status="paid";s.payment_intent ||= `pi_${randomUUID()}`;return s;}};
}
async function prepare(db:PrismaClient,f:Awaited<ReturnType<typeof setup>>,p:ReturnType<typeof provider>){return prepareImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,f.order.digest,"https://test.example",`/admin/billing/implementation?engagement=${f.id}`);}

test("SQL service: exact price/revision approval, stale quote rejection and approved scope immutability",{skip},()=>run(async db=>{
 const f=await setup(db);assert.equal(f.order.amountCents,200000);const revision2=await issueQuote(db,f.s,f.id,1,{...f.scope,departmentKeys:["DIETARY"]});
 await assert.rejects(()=>approveQuote(db,f.c,f.id,f.order.id,f.order.digest),/changed/);await approveQuote(db,f.c,f.id,revision2.id,revision2.digest);
 await assert.rejects(()=>issueQuote(db,f.s,f.id,2,f.scope),/immutable/);
 const approved=await db.implementationOrder.findUniqueOrThrow({where:{id:revision2.id}});assert.equal(approved.approvedByUserId,f.user.id);assert.equal(approved.amountCents,150000);
 await assert.rejects(()=>db.implementationOrder.update({where:{id:revision2.id},data:{amountCents:1}}),/immutable/);
}));
test("SQL service: only live Owner waives a complete scope; customer approval still required",{skip},()=>run(async db=>{
 const f=await setup(db,true);assert.equal(f.order.amountCents,0);assert.equal(f.order.waivedByStaffId,f.owner.id);
 await assert.rejects(()=>recordDelivery(db,f.s,f.id,{stage:"TRAINING",disposition:"DELIVERED",notes:"Actual session"}),/approved/);
 await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);assert.equal((await db.implementationOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,"WAIVED");
 await db.platformStaff.update({where:{id:f.owner.id},data:{role:"MEMBER"}});await assert.rejects(()=>issueQuote(db,f.s,f.id,1,f.scope,"unapproved waiver"),/authority/);
 const member:Actor={...f.s,session:{...f.s.session,staffRole:"MEMBER"}} as Actor;await assert.rejects(()=>issueQuote(db,member,f.id,1,f.scope,"not owner"),/Owner/);
}));
test("SQL service: current authority, credential, work-session and Facility boundaries deny mutations",{skip},()=>run(async db=>{
 const f=await setup(db);const qpin:Actor={kind:"customer",session:{...f.session,authMethod:"QUICK_PIN"}};await assert.rejects(()=>approveQuote(db,qpin,f.id,f.order.id,f.order.digest));
 const work:Actor={...f.s,workFacilityId:f.facility.id} as Actor;await assert.rejects(()=>recordMappingDecision(db,work,f.id,"Must not impersonate",null),/Exit/);
 const wrong:Actor={kind:"customer",session:{...f.session,facilityId:"other"}};await assert.rejects(()=>approveQuote(db,wrong,f.id,f.order.id,f.order.digest),/intended/);
 await db.user.update({where:{id:f.user.id},data:{sessionVersion:1}});await assert.rejects(()=>approveQuote(db,f.c,f.id,f.order.id,f.order.digest),/authority/);
 assert.equal((await db.implementationOrder.findUniqueOrThrow({where:{id:f.order.id}})).approvedAt,null);
}));
test("SQL service: private original upload has attribution, quarantine and retry receipts but no domain mutation",{skip},()=>run(async db=>{
 const f=await setup(db),store=createMemorySupportAttachmentStore(),bytes=Buffer.from("customer's original spreadsheet or CSV bytes"),submissionId=randomUUID();const before={users:await db.user.count({where:{facilityId:f.facility.id}}),employees:await db.employee.count({where:{facilityId:f.facility.id}}),imports:await db.setupImportBatch.count({where:{facilityId:f.facility.id}}),departments:await db.department.count({where:{facilityId:f.facility.id}})};
 const one=await receiveSource(db,f.c,f.id,{submissionId,filename:"original.xlsx",contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",bytes},store);const two=await receiveSource(db,f.c,f.id,{submissionId,filename:"original.xlsx",contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",bytes},store);
 assert.equal(one.messageId,two.messageId);assert.equal(one.attachments[0]!.scanStatus,"PENDING");assert.equal(store.objects.size,1);
 await assert.rejects(()=>receiveSource(db,f.c,f.id,{submissionId,filename:"changed.csv",contentType:"text/csv",bytes:Buffer.from("changed")},store),/different source/);
 const message=await db.supportTicketMessage.findUniqueOrThrow({where:{id:one.messageId}});assert.equal(message.kind,"INBOUND");assert.equal(message.authorStaffId,null);
 const event=await db.implementationEvent.findFirstOrThrow({where:{engagementId:f.id,kind:"SOURCE_RECEIVED"}});assert.equal(event.actorUserId,f.user.id);assert.equal(event.actorStaffId,null);
 assert.deepEqual({users:await db.user.count({where:{facilityId:f.facility.id}}),employees:await db.employee.count({where:{facilityId:f.facility.id}}),imports:await db.setupImportBatch.count({where:{facilityId:f.facility.id}}),departments:await db.department.count({where:{facilityId:f.facility.id}})},before);
 const failed=await receiveSource(db,f.s,f.id,{submissionId:randomUUID(),filename:"customer.docx",contentType:"application/octet-stream",bytes},null);assert.equal(failed.attachments[0]!.rejectionReason,"STORAGE_UNAVAILABLE");
}));
test("SQL service: explicit receipt sharing preserves original actor and rejects unrelated/cross-Facility/unlicensed scope",{skip},()=>run(async db=>{
 const f=await setup(db,true);await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);const text=f.workforce(),preview=await f.preview("workforce",text);await f.confirm(preview,text);
 await assert.rejects(()=>linkImport(db,f.s,f.id,preview.batchId),/original/);await linkImport(db,f.c,f.id,preview.batchId);
 const shared=await sharedResults(db,f.s,f.id);assert.equal(shared[0]!.actorKind,"user");assert.equal(shared[0]!.actorId,f.user.id);assert.equal(shared[0]!.receipts[0]!.status,"committed");assert.ok(!JSON.stringify(shared).includes("reviewedPlan"));
 const consoleWork={...f.session,uid:f.owner.id,authKind:"harbor_staff"} as FacilitySession;await assert.rejects(()=>getImportResults(db,consoleWork,preview.batchId),/actor/);
 const other=await fixture(db);await assert.rejects(()=>getEngagement(db,{kind:"customer",session:other.session},f.id));
 const next=await f.preview("department_locations",`department,locationType,locationId,kind\nPLANT,UNIT,${f.unit.id},PRIMARY\n`);await f.confirm(next,`department,locationType,locationId,kind\nPLANT,UNIT,${f.unit.id},PRIMARY\n`);
 await db.facilityDepartmentEntitlement.updateMany({where:{facilityId:f.facility.id,departmentKey:"PLANT"},data:{status:"REVOKED"}});await assert.rejects(()=>linkImport(db,f.c,f.id,next.batchId),/D09/);
}));
test("SQL service: customer acceptance binds delivered/deferred evidence and current receipt revision",{skip},()=>run(async db=>{
 const f=await setup(db,true);await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);
 const missing=await reviewHandoff(db,f.c,f.id);await assert.rejects(()=>acceptHandoff(db,f.c,f.id,missing.fingerprint),/missing/);
 for(const stage of STAGES)await recordDelivery(db,f.s,f.id,{stage,disposition:stage==="TRAINING"?"DEFERRED":"DELIVERED",notes:stage==="TRAINING"?"Customer requested training next week":"Reviewed actual delivery evidence"});
 const old=await reviewHandoff(db,f.c,f.id);await recordMappingDecision(db,f.s,f.id,"Customer requested corrected role mapping",null);await assert.rejects(()=>acceptHandoff(db,f.c,f.id,old.fingerprint),/changed/);
 const current=await reviewHandoff(db,f.c,f.id);await acceptHandoff(db,f.c,f.id,current.fingerprint);const accepted=await db.implementationEngagement.findUniqueOrThrow({where:{id:f.id}});assert.equal(accepted.acceptedByUserId,f.user.id);assert.equal(accepted.acceptedRevision,accepted.deliveryRevision);
 await assert.rejects(()=>recordMappingDecision(db,f.s,f.id,"Must request separate work",null),/accepted/);
 const billing=await db.facilityBilling.findUniqueOrThrow({where:{facilityId:f.facility.id}});assert.equal(billing.status,"ACTIVE");assert.equal(await db.department.count({where:{facilityId:f.facility.id}}),2);
}));
test("SQL payment: unapproved scope cannot start, concurrent repeated charging uses one stored request/key",{skip},()=>run(async db=>{
 const f=await setup(db),p=provider();await assert.rejects(()=>prepare(db,f,p),/Approve/);await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);await db.facility.update({where:{id:f.facility.id},data:{stripeCustomerId:"cus_existing"}});
 await Promise.all([prepare(db,f,p),prepare(db,f,p)]);const out=await Promise.all([reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true),reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true)]);assert.deepEqual(out.map(o=>o.status),["OPEN","OPEN"]);assert.equal(p.creates,1);
 const attempt=await db.implementationPaymentAttempt.findFirstOrThrow({where:{orderId:f.order.id}}),request=attempt.request as unknown as Stripe.Checkout.SessionCreateParams;assert.equal(request.mode,"payment");assert.equal(request.customer,"cus_existing");assert.equal(request.subscription_data,undefined);assert.equal(request.line_items![0]!.price_data!.unit_amount,200000);assert.equal(attempt.status,"OPEN");
}));
test("SQL payment: lost provider response reconciles success before retry and webhook/return replay settles once",{skip},()=>run(async db=>{
 const f=await setup(db),p=provider();await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);await db.facility.update({where:{id:f.facility.id},data:{stripeCustomerId:"cus_existing"}});await prepare(db,f,p);p.loseResponse();
 assert.equal((await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true)).status,"UNKNOWN");const paid=p.paid();
 await Promise.all([reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true),handleImplementationCheckout({db,stripe:p.stripe},paid)]);
 for(let i=0;i<2;i++)await handleStripeBillingEvent({type:"checkout.session.completed",data:{object:paid}} as Stripe.Event,{db,stripe:p.stripe});
 assert.equal(p.creates,1);assert.equal((await db.implementationOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,"PAID");assert.equal(await db.implementationEvent.count({where:{engagementId:f.id,kind:"PAYMENT_SETTLED"}}),1);assert.equal(await db.implementationPaymentAttempt.count({where:{orderId:f.order.id}}),1);
 assert.equal((await db.facilityBilling.findUniqueOrThrow({where:{facilityId:f.facility.id}})).stripeSubscriptionId,null,"service does not create a subscription");
}));
test("SQL payment: failed history scan or unknown attempt beyond replay window never creates a new charge",{skip},()=>run(async db=>{
 const f=await setup(db),p=provider();await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);await db.facility.update({where:{id:f.facility.id},data:{stripeCustomerId:"cus_existing"}});await prepare(db,f,p);p.listFailure();assert.equal((await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true)).status,"UNKNOWN");assert.equal(p.creates,0);
 const clean=provider();assert.equal((await reconcileImplementationPayment({db,stripe:clean.stripe,now:()=>new Date(Date.now()+13*3600*1000)},f.c,f.id,f.order.id,true)).status,"UNKNOWN");assert.equal(clean.creates,0);await prepare(db,f,clean);assert.equal(await db.implementationPaymentAttempt.count({where:{orderId:f.order.id}}),1);
}));
test("SQL payment: mismatched amount/customer blocks reconciliation; positively expired unpaid attempt permits a distinct safe attempt",{skip},()=>run(async db=>{
 const f=await setup(db),p=provider();await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);await db.facility.update({where:{id:f.facility.id},data:{stripeCustomerId:"cus_existing"}});await prepare(db,f,p);await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true);
 const session=[...p.sessions.values()][0]!;session.amount_total=1;assert.equal((await reconcileImplementationPayment({db,stripe:p.stripe},f.s,f.id,f.order.id)).status,"UNKNOWN");assert.equal((await db.implementationOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,"APPROVED");session.amount_total=200000;session.status="expired";assert.equal((await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id)).status,"EXPIRED");await prepare(db,f,p);assert.equal(await db.implementationPaymentAttempt.count({where:{orderId:f.order.id}}),2);await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true);assert.equal(p.creates,2);
}));

test("SQL service: staff shares its own receipts outside work; customer reads actual PlatformStaff execution",{skip},()=>run(async db=>{
 const f=await setup(db,true);await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);
 const work={...f.session,uid:f.owner.id,email:f.owner.email,name:f.owner.displayName,authKind:"harbor_staff",primaryDepartmentId:undefined} as FacilitySession;
 const csv=f.workforce(),preview=await previewImport(db,work,{dataset:"workforce",text:csv,fileName:"workforce.csv",expectedFacilityId:f.facility.id});await confirmImport(db,work,{reviewToken:preview.reviewToken,expectedFacilityId:f.facility.id,text:csv,fileName:"workforce.csv",confirmedAccountRows:[]});
 await assert.rejects(()=>linkImport(db,f.c,f.id,preview.batchId),/original/);await linkImport(db,f.s,f.id,preview.batchId);const receipts=await sharedResults(db,f.c,f.id);assert.equal(receipts[0]!.actorKind,"harbor_staff");assert.equal(receipts[0]!.actorId,f.owner.id);assert.equal(receipts[0]!.outcomes[0]!.status,"committed");
 const event=await db.implementationEvent.findFirstOrThrow({where:{engagementId:f.id,kind:"IMPORT_SHARED"}});assert.equal(event.actorStaffId,f.owner.id);assert.equal(event.actorUserId,null);
 const batch=await db.setupImportBatch.findUniqueOrThrow({where:{id:preview.batchId}});assert.equal(batch.actorStaffId,f.owner.id);assert.equal(batch.actorUserId,null);assert.equal(await db.user.count({where:{id:f.owner.id}}),0);
}));
test("SQL service: shared partial failure and retry history changes handoff fingerprint and never claims rollback",{skip},()=>run(async db=>{
 const f=await setup(db,true);await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);const csv=f.workforce()+f.workforce(`second-${f.email}`).split("\n")[1]+"\n",p=await f.preview("workforce",csv);let fail=true;
 const faulty=db.$extends({query:{setupImportResult:{async create({args,query}){if(fail&&args.data.rowNumber===3&&args.data.status==="committed"){fail=false;throw Error("controlled atomic receipt failure");}return query(args);}}}}) as unknown as PrismaClient;
 await confirmImport(faulty,f.session,{reviewToken:p.reviewToken,expectedFacilityId:f.facility.id,text:csv,fileName:p.fileName,confirmedAccountRows:[]});await linkImport(db,f.c,f.id,p.batchId);
 const shared=await sharedResults(db,f.s,f.id);assert.deepEqual(shared[0]!.outcomes.map(o=>o.status),["committed","failed"]);const before=await reviewHandoff(db,f.c,f.id);await f.confirm(p);const after=await reviewHandoff(db,f.c,f.id);assert.notEqual(before.fingerprint,after.fingerprint);assert.deepEqual(after.results[0]!.outcomes.map(o=>o.status),["committed","committed"]);assert.equal(after.results[0]!.receipts.filter(r=>r.row===3).length,2);
}));
test("SQL payment: changed customer authority denies retry; settled service cannot restore canceled Department access",{skip},()=>run(async db=>{
 const f=await setup(db),p=provider();await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);await db.facility.update({where:{id:f.facility.id},data:{stripeCustomerId:"cus_existing"}});await prepare(db,f,p);await db.user.update({where:{id:f.user.id},data:{sessionVersion:1}});await assert.rejects(()=>reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true),/authority/);assert.equal(p.creates,0);await db.user.update({where:{id:f.user.id},data:{sessionVersion:0}});
 await applyFacilitySubscription({facilityId:f.facility.id,status:"CANCELED",departmentKeys:["DIETARY","PLANT"]},db);await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true);await handleImplementationCheckout({db,stripe:p.stripe},p.paid());assert.equal((await db.facilityBilling.findUniqueOrThrow({where:{facilityId:f.facility.id}})).status,"CANCELED");const {loadCustomerOperableDepartments}=await import("@/lib/department-products/load-facility-catalog");assert.equal((await loadCustomerOperableDepartments(db,f.facility.id)).length,0);
}));
test("SQL billing customer: concurrent canonical configuration creates no subscription or service charge",{skip},()=>run(async db=>{
 const f=await setup(db);const {ensureFacilityStripeCustomer}=await import("@/lib/billing/stripe-customer");let creates=0;const stripe={customers:{create:async(_r:unknown,options:{idempotencyKey:string})=>{creates++;assert.equal(options.idempotencyKey,`facility-customer-${f.facility.id}`);return{id:"cus_once"};}}} as unknown as Stripe;
 const input={facilityId:f.facility.id,displayName:f.facility.displayName,billingEmail:null,stripeCustomerId:null,fallbackEmail:f.user.email};const results=await Promise.all([ensureFacilityStripeCustomer(input,{db,stripe}),ensureFacilityStripeCustomer(input,{db,stripe})]);assert.deepEqual(results,["cus_once","cus_once"]);assert.equal(creates,1);assert.equal(await db.implementationPaymentAttempt.count({where:{orderId:f.order.id}}),0);assert.equal((await db.facilityBilling.findUniqueOrThrow({where:{facilityId:f.facility.id}})).stripeSubscriptionId,null);
}));

test("SQL payment: local settlement receipt failure rolls back all local writes; recovery observes the same paid provider session",{skip},()=>run(async db=>{
 const f=await setup(db),p=provider();await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);await db.facility.update({where:{id:f.facility.id},data:{stripeCustomerId:"cus_existing"}});await prepare(db,f,p);await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true);p.paid();let fail=true;
 const faulty=db.$extends({query:{implementationEvent:{async create({args,query}){if(fail&&args.data.kind==="PAYMENT_SETTLED"){fail=false;throw Error("injected local settlement receipt failure");}return query(args);}}}}) as unknown as PrismaClient;
 await assert.rejects(()=>reconcileImplementationPayment({db:faulty,stripe:p.stripe},f.c,f.id,f.order.id,true),/receipt failure/);
 assert.equal((await db.implementationOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,"APPROVED");assert.equal((await db.implementationPaymentAttempt.findFirstOrThrow({where:{orderId:f.order.id}})).status,"OPEN");
 assert.equal((await reconcileImplementationPayment({db,stripe:p.stripe},f.s,f.id,f.order.id)).status,"PAID");assert.equal(p.creates,1);assert.equal(await db.implementationEvent.count({where:{engagementId:f.id,kind:"PAYMENT_SETTLED"}}),1);
}));
test("SQL handoff: accepted snapshot is immutable and later canonical retry is visibly outside acceptance",{skip},()=>run(async db=>{
 const f=await setup(db,true);await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);const csv=f.workforce()+f.workforce(`second-${f.email}`).split("\n")[1]+"\n",p=await f.preview("workforce",csv);let fail=true;
 const faulty=db.$extends({query:{setupImportResult:{async create({args,query}){if(fail&&args.data.rowNumber===3&&args.data.status==="committed"){fail=false;throw Error("controlled row failure");}return query(args);}}}}) as unknown as PrismaClient;
 await confirmImport(faulty,f.session,{reviewToken:p.reviewToken,expectedFacilityId:f.facility.id,text:csv,fileName:p.fileName,confirmedAccountRows:[]});await linkImport(db,f.c,f.id,p.batchId);for(const stage of STAGES)await recordDelivery(db,f.s,f.id,{stage,disposition:stage==="IMPORT_REVIEW"?"DEFERRED":"DELIVERED",notes:"Customer reviewed the first committed row; failed second row explicitly deferred"});
 await acceptHandoff(db,f.c,f.id,(await reviewHandoff(db,f.c,f.id)).fingerprint);const accepted=await db.implementationEvent.findFirstOrThrow({where:{engagementId:f.id,kind:"CUSTOMER_ACCEPTED"}});assert.equal((await reviewHandoff(db,f.c,f.id)).acceptanceCurrent,true);await f.confirm(p);assert.equal((await reviewHandoff(db,f.c,f.id)).acceptanceCurrent,false);assert.deepEqual((await db.implementationEvent.findUniqueOrThrow({where:{id:accepted.id}})).data,accepted.data);
}));

test("SQL private source: explicit staff participants can read only linked CLEAN originals, never unrelated support attachments",{skip},()=>run(async db=>{
 const f=await setup(db),store=createMemorySupportAttachmentStore(),bytes=Buffer.from("synthetic source fixture"),source=await receiveSource(db,f.c,f.id,{submissionId:randomUUID(),filename:"source.csv",contentType:"text/csv",bytes},store);const attachment=source.attachments[0]!;
 const {readImplementationSource}=await import("./service");await assert.rejects(()=>readImplementationSource(db,f.s,f.id,attachment.id,store),/quarantined/);
 // Fixture simulates an external real scanner's already-existing CLEAN verdict. It does not test or introduce scanning.
 await db.supportTicketAttachment.update({where:{id:attachment.id},data:{scanStatus:"CLEAN"}});
 assert.deepEqual(Buffer.from((await readImplementationSource(db,f.s,f.id,attachment.id,store)).bytes),bytes);await assert.rejects(()=>readImplementationSource(db,f.c,f.id,attachment.id,store),/Console staff/);
 const other=await setup(db);await assert.rejects(()=>readImplementationSource(db,other.c,f.id,attachment.id,store));await assert.rejects(()=>readImplementationSource(db,f.c,other.id,attachment.id,store));
 await db.platformStaff.update({where:{id:f.owner.id},data:{sessionVersion:1}});await assert.rejects(()=>readImplementationSource(db,f.s,f.id,attachment.id,store),/authority/);
}));

test("SQL service: reviewer source attribution uses the uploading person's actual support contact",{skip},()=>run(async db=>{
 const f=await setup(db);const second=await db.user.create({data:{facilityId:f.facility.id,primaryDepartmentId:f.plant.id,roleId:f.user.roleId,email:`reviewer-${randomUUID()}@example.com`,displayName:"Actual Reviewer",passwordHash:"fixture",emailVerifiedAt:new Date()}});const secondAccess=await db.userFacilityAccess.create({data:{facilityId:f.facility.id,userId:second.id}});await db.employee.create({data:{facilityId:f.facility.id,userId:second.id,email:second.email,firstName:"Actual",lastName:"Reviewer",roleType:"FACILITY_ADMINISTRATOR",employmentType:"FULL_TIME",primaryDepartmentId:f.plant.id}});await addParticipant(db,f.c,f.id,second.id);
 // A facility has one Facility Administrator (CDA-02): the role moves to the reviewer before they upload.
 const handover=new Date();await db.userFacilityRolePeriod.updateMany({where:{roleKey:"FACILITY_ADMINISTRATOR",endsAt:null,userFacilityAccess:{facilityId:f.facility.id}},data:{endsAt:handover}});await db.userFacilityRolePeriod.create({data:{userFacilityAccessId:secondAccess.id,roleKey:"FACILITY_ADMINISTRATOR",startsAt:handover}});
 const actor:Actor={kind:"customer",session:{...f.session,uid:second.id,email:second.email,name:second.displayName}};const receipt=await receiveSource(db,actor,f.id,{submissionId:randomUUID(),filename:"review.csv",contentType:"text/csv",bytes:Buffer.from("actual source")},createMemorySupportAttachmentStore());const message=await db.supportTicketMessage.findUniqueOrThrow({where:{id:receipt.messageId},include:{contact:true}});assert.equal(message.contact!.email,second.email);assert.equal(message.fromEmail,second.email);assert.notEqual(message.contact!.email,f.user.email);
}));
test("SQL service: serialized delivery revision wins even when transaction start timestamps are reversed",{skip},()=>run(async db=>{
 const f=await setup(db,true);await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);let waiting!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{waiting=r;}),resume=new Promise<void>(r=>{release=r;});let hold=true;
 const delayed=db.$extends({query:{platformStaff:{async findUnique({args,query}){if(hold){hold=false;waiting();await resume;}return query(args);}}}}) as unknown as PrismaClient;
 const later=recordDelivery(delayed,f.s,f.id,{stage:"MAPPING",disposition:"DELIVERED",notes:"Later serialized delivery"});await entered;await recordDelivery(db,f.s,f.id,{stage:"MAPPING",disposition:"DEFERRED",notes:"Earlier completed delivery"});release();await later;const review=await reviewHandoff(db,f.c,f.id);assert.equal((review.stages[0]!.evidence as {notes:string}).notes,"Later serialized delivery");
}));

test("REAL service intake: a customer original is scanned through the real private worker and becomes readable only by authorized staff",{skip:skip||!process.env.SUPPORT_SCANNER_TEST_CONFIG_DIR},()=>run(async db=>{
 const {readFileSync}=await import("node:fs"),{getSupportAttachmentScanner}=await import("@/lib/support/attachment-scanner"),{processPendingSupportAttachments}=await import("@/lib/support/scan-pending-attachments"),{readImplementationSource}=await import("./service");const dir=process.env.SUPPORT_SCANNER_TEST_CONFIG_DIR!;const scanner=getSupportAttachmentScanner({SUPPORT_SCANNER_URL:"https://127.0.0.1:55477/scan",SUPPORT_SCANNER_ALLOWED_HOSTS:"127.0.0.1:55477",SUPPORT_SCANNER_BEARER_TOKEN:readFileSync(`${dir}/token`,"utf8").trim(),SUPPORT_SCANNER_CA_PEM:readFileSync(`${dir}/cert.pem`,"utf8")} as NodeJS.ProcessEnv)!;
 const f=await setup(db),store=createMemorySupportAttachmentStore(),bytes=Buffer.from("email,firstName\nprivate@example.com,Actual\n");const receipt=await receiveSource(db,f.c,f.id,{submissionId:randomUUID(),filename:"customer-existing.csv",contentType:"text/csv",bytes},store);const attachment=receipt.attachments[0]!;await assert.rejects(()=>readImplementationSource(db,f.s,f.id,attachment.id,store),/quarantined/);const result=await processPendingSupportAttachments(db,{scanner,store,attachmentIds:[attachment.id]});assert.equal(result.results[0]?.status,"CLEAN");assert.deepEqual(Buffer.from((await readImplementationSource(db,f.s,f.id,attachment.id,store)).bytes),bytes);await assert.rejects(()=>readImplementationSource(db,f.c,f.id,attachment.id,store),/Console staff/);const view=await getEngagement(db,f.c,f.id);assert.equal(view.attachments[0]!.scanStatus,"CLEAN");assert.match(view.attachments[0]!.scannerEngineVersion!,/^1\.4\./);assert.equal(await db.setupImportBatch.count({where:{facilityId:f.facility.id}}),0,"upload/scan does not authorize imports");assert.equal(await db.employee.count({where:{facilityId:f.facility.id}}),1,"no workforce mutation");
}));

test("SQL service: approval authority expiring during a Facility lock wait is rechecked before writing",{skip},()=>run(async db=>{
 const f=await setup(db);await db.userFacilityRolePeriod.updateMany({where:{userFacilityAccessId:f.grant.id},data:{endsAt:new Date(Date.now()+700)}});let unlock!:()=>void,signal!:()=>void;const waiting=new Promise<void>(r=>{signal=r;}),release=new Promise<void>(r=>{unlock=r;});const holder=db.$transaction(async tx=>{await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id"=${f.facility.id} FOR UPDATE`);signal();await release;},{timeout:10000});await waiting;const approval=approveQuote(db,f.c,f.id,f.order.id,f.order.digest);await new Promise(r=>setTimeout(r,1000));unlock();await holder;await assert.rejects(()=>approval,/authority|session/);assert.equal((await db.implementationOrder.findUniqueOrThrow({where:{id:f.order.id}})).approvedAt,null);
}));
test("SQL payment: authority expiring during provider history reconciliation cannot start checkout",{skip},()=>run(async db=>{
 const f=await setup(db),p=provider();await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);await db.facility.update({where:{id:f.facility.id},data:{stripeCustomerId:"cus_existing"}});await prepare(db,f,p);await db.userFacilityRolePeriod.updateMany({where:{userFacilityAccessId:f.grant.id},data:{endsAt:new Date(Date.now()+700)}});p.stripe.checkout.sessions.list=(async()=>{await new Promise(r=>setTimeout(r,1000));return{data:[],has_more:false};}) as unknown as typeof p.stripe.checkout.sessions.list;await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true).catch(()=>undefined);assert.equal(p.creates,0,"expired authority must not create a provider checkout after reconciliation waits");
}));
