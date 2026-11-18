import { traceDisposableTransactions } from "@/lib/verify/trace-disposable-transactions";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, RoleKey } from "@prisma/client";
import type Stripe from "stripe";
import type { FacilitySession } from "@/lib/auth";
import { createHarborSessionToken, verifyHarborSessionToken } from "@/lib/harbor-console/session";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { applyFacilitySubscription } from "@/lib/billing/apply-stripe-event";
import { listHarborFacilities, loadHarborCustomerDirectoryPage, loadHarborToday } from "@/lib/harbor-console/queries";
import { previewImport, confirmImport, getImportResults } from "@/lib/setup-imports/service";
import type { Dataset, Preview } from "@/lib/setup-imports/contract";
import { requestEngagement, addParticipant, assignEngagement, issueQuote, approveQuote, recordDelivery, recordMappingDecision, receiveSource, linkImport, sharedResults, reviewHandoff, acceptHandoff, getEngagement, loadStaffImplementationWorkCounts } from "./service";
import { STAGES } from "./contract";
import type { Actor } from "./authority";
import { prepareImplementationPayment, reconcileImplementationPayment, handleImplementationCheckout } from "@/lib/billing/implementation-payment";
import { handleStripeBillingEvent } from "@/lib/billing/webhook-handlers";
import { createMemorySupportAttachmentStore } from "@/lib/support/attachment-store";
import { inviteFacilityAdministratorSuccessor, acceptFacilityAdministratorInvitation } from "@/lib/facility-administrator/service";
import { bootstrapFacilityCustomer } from "@/lib/facility-provisioning/bootstrap";
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
  const session = { jti: randomUUID(), uid: user.id, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", role: "FACILITY_ADMINISTRATOR", facilityId: facility.id, primaryDepartmentId: plant.id, name: user.displayName, email: user.email, sessionVersion: 0 } as FacilitySession;
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
  const c:Actor={kind:"customer",session:f.session};const s:Actor={kind:"staff",session:await verifyHarborSessionToken(await createHarborSessionToken({uid:owner.id,email:owner.email,name:owner.displayName,staffRole:owner.role,sessionVersion:owner.sessionVersion})),workFacilityId:null};
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

test("SQL Implementation request replay: concurrent normalized retries have one aggregate and new intent remains explicit", {skip},()=>run(async db=>{
 const f=await fixture(db),actor:Actor={kind:"customer",session:f.session},requestId=randomUUID();
 const scope={departmentKeys:["DIETARY","PLANT"],deliverables:["Map the site","Review the roster"]};
 const results=await Promise.all([
   requestEngagement(db,actor,f.facility.id,scope,requestId),
   requestEngagement(db,actor,f.facility.id,{departmentKeys:["PLANT","HEALTHCARE_FOOD_NUTRITION","DIETARY"],deliverables:[" Map the site ","Review the roster "]},requestId),
 ]);
 assert.deepEqual(results,[requestId,requestId]);
 assert.equal(await db.implementationEngagement.count({where:{facilityId:f.facility.id}}),1);
 assert.equal(await db.supportTicket.count({where:{facilityId:f.facility.id}}),1);
 assert.equal(await db.implementationParticipant.count({where:{engagementId:requestId,userId:f.user.id}}),1);
 assert.equal(await db.implementationEvent.count({where:{engagementId:requestId,kind:"REQUESTED",actorUserId:f.user.id}}),1);
 assert.equal(await db.supportTicketEvent.count({where:{ticket:{facilityId:f.facility.id},type:"CREATED"}}),1);
 await assert.rejects(()=>requestEngagement(db,actor,f.facility.id,scope,"invalid-key"),/valid request identifier/);
 await assert.rejects(()=>requestEngagement(db,actor,f.facility.id,{...scope,deliverables:["Changed work"]},requestId),/different request/);
 const next=await requestEngagement(db,actor,f.facility.id,scope,randomUUID());
 assert.notEqual(next,requestId);
 const legacyA=await requestEngagement(db,actor,f.facility.id,scope),legacyB=await requestEngagement(db,actor,f.facility.id,scope);
 assert.notEqual(legacyA,legacyB);
 await db.userFacilityAccess.update({where:{id:f.grant.id},data:{isActive:false,revokedAt:new Date()}});
 await assert.rejects(()=>requestEngagement(db,actor,f.facility.id,scope,requestId),/authority|session/i);
}));

test("SQL Implementation request replay: an authorized successor cannot adopt the former requester's identifier", {skip},()=>run(async db=>{
 const f=await fixture(db),requestId=randomUUID(),scope={departmentKeys:["PLANT"],deliverables:["Review synthetic setup"]};
 await requestEngagement(db,{kind:"customer",session:f.session},f.facility.id,scope,requestId);
 const role=await db.role.findUniqueOrThrow({where:{key:"MANAGER"}});
 const successor=await db.user.create({data:{email:`successor-${randomUUID()}@example.invalid`,displayName:"Synthetic successor",facilityId:f.facility.id,roleId:role.id,passwordHash:"unused-fixture",emailVerifiedAt:new Date()}});
 await db.userFacilityAccess.create({data:{userId:successor.id,facilityId:f.facility.id,rolePeriods:{create:{roleKey:"MANAGER",startsAt:new Date(0)}}}});
 const invite=await inviteFacilityAdministratorSuccessor(db,{actorUserId:f.user.id,facilityId:f.facility.id,invitedUserId:successor.id,outgoingRoleKey:"GM"});
 await acceptFacilityAdministratorInvitation(db,{actorUserId:successor.id,invitationId:invite.id});
 const current=await db.user.findUniqueOrThrow({where:{id:successor.id}});
 const actor:Actor={kind:"customer",session:{...f.session,uid:current.id,email:current.email,name:current.displayName,sessionVersion:current.sessionVersion}};
 await assert.rejects(()=>requestEngagement(db,actor,f.facility.id,scope,requestId),/different request/);
 assert.notEqual(await requestEngagement(db,actor,f.facility.id,scope,randomUUID()),requestId);
}));

test("SQL Implementation request replay: the same Administrator cannot move a request into another authorized Facility", {skip},()=>run(async db=>{
 const f=await fixture(db),requestId=randomUUID(),scope={departmentKeys:["PLANT"],deliverables:["Review synthetic setup"]};
 await requestEngagement(db,{kind:"customer",session:f.session},f.facility.id,scope,requestId);
 const other=await db.$transaction(tx=>bootstrapFacilityCustomer(tx,{
   organization:{mode:"existing",organizationId:f.org.id},
   facility:{displayName:`Additional synthetic Facility ${randomUUID()}`,billingEmail:f.user.email,timezone:"America/New_York"},
   administrator:{mode:"reuse",userId:f.user.id},
 }));
 const actor:Actor={kind:"customer",session:{...f.session,facilityId:other.facility.id}};
 await assert.rejects(()=>requestEngagement(db,actor,other.facility.id,scope,requestId),/different request/);
 assert.notEqual(await requestEngagement(db,actor,other.facility.id,scope,randomUUID()),requestId);
}));

test("SQL Implementation request replay: a racing actor and Facility cannot reuse another request key or leave an orphan ticket", {skip},()=>run(async db=>{
 const a=await fixture(db),b=await fixture(db),requestId=randomUUID(),scope={departmentKeys:["PLANT"],deliverables:["Map the synthetic building"]};
 let arrivals=0,release!:()=>void;
 const together=new Promise<void>(resolve=>{release=resolve;});
 const racing=db.$extends({query:{implementationEngagement:{async findUnique({args,query}){
   const row=await query(args);
   if(args.where.id===requestId&&!row&&arrivals<2){if(++arrivals===2)release();await together;}
   return row;
 }}}}) as unknown as PrismaClient;
 const outcomes=await Promise.allSettled([a,b].map(f=>requestEngagement(racing,{kind:"customer",session:f.session},f.facility.id,scope,requestId)));
 assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);
 const failure=outcomes.find(r=>r.status==="rejected");
 assert.ok(failure?.status==="rejected");
 assert.match(String(failure.reason),/different request/);
 assert.equal(await db.implementationEngagement.count({where:{facilityId:{in:[a.facility.id,b.facility.id]}}}),1);
 assert.equal(await db.supportTicket.count({where:{facilityId:{in:[a.facility.id,b.facility.id]}}}),1);
 const winner=await db.implementationEngagement.findUniqueOrThrow({where:{id:requestId}});
 const loser=winner.facilityId===a.facility.id?b:a;
 await assert.rejects(()=>requestEngagement(db,{kind:"customer",session:loser.session},loser.facility.id,scope,requestId),/different request/);
}));

test("SQL Implementation request replay: audit failure rolls back intake and a lost COMMIT response recovers the same request", {skip},()=>run(async db=>{
 const f=await fixture(db),actor:Actor={kind:"customer",session:f.session},requestId=randomUUID(),scope={departmentKeys:["PLANT"],deliverables:["Prepare synthetic setup"]};
 const faulty=db.$extends({query:{implementationEvent:{async create({args,query}){
   if(args.data.kind==="REQUESTED")throw Error("injected request audit failure");
   return query(args);
 }}}}) as unknown as PrismaClient;
 await assert.rejects(()=>requestEngagement(faulty,actor,f.facility.id,scope,requestId),/injected request audit/);
 assert.equal(await db.supportTicket.count({where:{facilityId:f.facility.id}}),0);
 assert.equal(await db.implementationEngagement.count({where:{id:requestId}}),0);
 assert.equal(await db.implementationParticipant.count({where:{engagementId:requestId}}),0);
 let lost=false;
 const uncertain=new Proxy(db,{get(target,key){
   if(key==="$transaction")return async(work:unknown,options:unknown)=>{
     const result=await (target.$transaction as unknown as (work:unknown,options:unknown)=>Promise<unknown>).call(target,work,options);
     if(!lost){lost=true;throw Error("lost request COMMIT response");}
     return result;
   };
   const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
 }}) as PrismaClient;
 await assert.rejects(()=>requestEngagement(uncertain,actor,f.facility.id,scope,requestId),/lost request COMMIT response/);
 assert.equal(await requestEngagement(db,actor,f.facility.id,scope,requestId),requestId);
 assert.equal(await db.supportTicket.count({where:{facilityId:f.facility.id}}),1);
 assert.equal(await db.implementationParticipant.count({where:{engagementId:requestId}}),1);
 assert.equal(await db.implementationEvent.count({where:{engagementId:requestId,kind:"REQUESTED"}}),1);
}));

test("SQL work counts: same staff scope as the index, without including accepted or other Facility engagements", { skip }, () => run(async db => {
  const current = await setup(db, true);
  const other = await fixture(db);
  await approveQuote(db, current.c, current.id, current.order.id, current.order.digest);
  for (const stage of STAGES) await recordDelivery(db, current.s, current.id, {
    stage, disposition: "DELIVERED", notes: "Reviewed synthetic delivery evidence",
  });
  await acceptHandoff(db, current.c, current.id, (await reviewHandoff(db, current.c, current.id)).fingerprint);
  const assigned = await requestEngagement(db, current.c, current.facility.id, current.scope);
  await assignEngagement(db, current.s, assigned, current.owner.id);
  await requestEngagement(db, current.c, current.facility.id, current.scope);
  await requestEngagement(db, { kind: "customer", session: other.session }, other.facility.id, current.scope);

  const member = await db.platformStaff.create({ data: {
    email: `overview-${randomUUID()}@example.com`, displayName: "Operations staff", passwordHash: "no-login", role: "MEMBER",
  } });
  const reviewer: Extract<Actor, { kind: "staff" }> = {
    kind: "staff", workFacilityId: null, session: await verifyHarborSessionToken(await createHarborSessionToken({
      uid: member.id, email: member.email, name: member.displayName, staffRole: member.role, sessionVersion: member.sessionVersion,
    })),
  };
  assert.deepEqual(await loadStaffImplementationWorkCounts(db, current.s, current.facility.id), { open: 2, unassigned: 1 });
  assert.deepEqual(await loadStaffImplementationWorkCounts(db, reviewer, current.facility.id), { open: 2, unassigned: 1 });
  assert.deepEqual(await loadStaffImplementationWorkCounts(db, reviewer, other.facility.id), { open: 1, unassigned: 1 });
  await assert.rejects(() => getEngagement(db, reviewer, assigned), /explicitly recorded participation/);
  await assert.rejects(() => loadStaffImplementationWorkCounts(db, current.c, current.facility.id), /Console staff/);
  await assert.rejects(() => loadStaffImplementationWorkCounts(db, { ...reviewer, workFacilityId: other.facility.id }, current.facility.id), /Exit the Facility work session/);
  await db.platformStaff.update({ where: { id: member.id }, data: { sessionVersion: { increment: 1 } } });
  await assert.rejects(() => loadStaffImplementationWorkCounts(db, reviewer, current.facility.id), /Console authority changed/);
}));

test("SQL directory: composes search, guided setup, and Implementation work past 200 with stable name ties", { skip }, () => run(async db => {
  const prefix = `Ops filter ${randomUUID()}`;
  const assigned = await setup(db);
  const awaiting = await fixture(db, assigned.org.id);
  const accepted = await setup(db, true);
  const fillers = Array.from({ length: 200 }, (_, index) => ({
    id: randomUUID(),
    organizationId: assigned.org.id,
    // The equal names straddle the first page boundary.
    displayName: `${prefix} A${String(index === 25 ? 24 : index).padStart(3, "0")}`,
  }));
  await db.facility.createMany({ data: fillers });
  await db.facility.update({ where: { id: assigned.facility.id }, data: {
    displayName: `${prefix} B Assigned`, billingEmail: `assigned-${assigned.user.email}`,
    onboardingCompletedAt: new Date(),
  } });
  await db.facility.update({ where: { id: awaiting.facility.id }, data: {
    displayName: `${prefix} C Unassigned`, billingEmail: `unassigned-${awaiting.user.email}`,
    onboardingCompletedAt: null, onboardingCurrentStep: "locations",
  } });
  await db.facility.update({ where: { id: accepted.facility.id }, data: {
    displayName: `${prefix} D Accepted`, onboardingCompletedAt: new Date(),
  } });
  await requestEngagement(db, { kind: "customer", session: awaiting.session }, awaiting.facility.id, assigned.scope);
  await approveQuote(db, accepted.c, accepted.id, accepted.order.id, accepted.order.digest);
  for (const stage of STAGES) await recordDelivery(db, accepted.s, accepted.id, {
    stage, disposition: "DELIVERED", notes: "Reviewed synthetic delivery evidence",
  });
  await acceptHandoff(db, accepted.c, accepted.id, (await reviewHandoff(db, accepted.c, accepted.id)).fingerprint);

  const baseline = await listHarborFacilities(db, prefix);
  assert.equal(baseline.length, 200);
  assert.ok(!baseline.some(row => [assigned.facility.id, awaiting.facility.id, accepted.facility.id].includes(row.id)));
  const open = { filter: "open", actor: assigned.s } as const;
  const unassigned = { filter: "unassigned", actor: assigned.s } as const;
  assert.deepEqual((await listHarborFacilities(db, prefix.toUpperCase(), open)).map(row => row.id), [assigned.facility.id, awaiting.facility.id]);
  assert.deepEqual((await listHarborFacilities(db, prefix, unassigned)).map(row => row.id), [awaiting.facility.id]);
  assert.deepEqual((await listHarborFacilities(db, ` UNASSIGNED-${awaiting.user.email.toUpperCase()} `, open)).map(row => row.id), [awaiting.facility.id]);
  assert.deepEqual(await listHarborFacilities(db, `assigned-${assigned.user.email}`, unassigned), []);
  assert.deepEqual(await listHarborFacilities(db, `${prefix} D Accepted`, open), []);
  assert.deepEqual(await listHarborFacilities(db, `${prefix} D Accepted`, unassigned), []);
  assert.deepEqual((await listHarborFacilities(db, `${prefix} D Accepted`)).map(row => row.id), [accepted.facility.id]);
  await assert.rejects(() => listHarborFacilities(db, prefix, { filter: "open", actor: assigned.c }), /Console staff/);
  if (assigned.s.kind !== "staff") throw new Error("Expected staff fixture");
  const legacy = { ...assigned.s, workFacilityId: accepted.facility.id };
  await assert.rejects(() => listHarborFacilities(db, prefix, { filter: "unassigned", actor: legacy }), /Exit the Facility work session/);

  const first = await loadHarborCustomerDirectoryPage(db, { query: prefix });
  const second = await loadHarborCustomerDirectoryPage(db, { query: prefix, page: "2" });
  assert.equal(first.total, 203);
  assert.equal(first.pageCount, 9);
  assert.equal(first.rows.length, 25);
  assert.equal(second.offset, 25);
  assert.deepEqual([first.rows.at(-1)?.id, second.rows[0]?.id], [fillers[24].id, fillers[25].id].sort());

  const last = await loadHarborCustomerDirectoryPage(db, { query: prefix, page: "9999999" });
  assert.equal(last.page, 9);
  assert.equal(last.offset, 200);
  assert.deepEqual(last.rows.map(row => row.id), [assigned.facility.id, awaiting.facility.id, accepted.facility.id]);
  for (const page of [["2", "9"], "0", "-2", "1e4", "2.5", "99999999999999999999"]) {
    const invalid = await loadHarborCustomerDirectoryPage(db, { query: prefix, page });
    assert.equal(invalid.page, 1);
    assert.deepEqual(invalid.rows.map(row => row.id), first.rows.map(row => row.id));
  }

  const filtered = await loadHarborCustomerDirectoryPage(db, { query: prefix, implementation: open, page: "9" });
  assert.equal(filtered.total, 2);
  assert.equal(filtered.page, 1);
  assert.deepEqual(filtered.rows.map(row => row.id), [assigned.facility.id, awaiting.facility.id]);
  const setupPage = await loadHarborCustomerDirectoryPage(db, { query: prefix, setup: "awaiting", page: "9" });
  assert.equal(setupPage.total, 201);
  assert.equal(setupPage.offset, 200);
  assert.deepEqual(setupPage.rows.map(row => row.id), [awaiting.facility.id]);
  assert.equal(setupPage.rows[0]?.onboarding, "Setup: locations");
  const combined = await loadHarborCustomerDirectoryPage(db, { query: prefix.toUpperCase(), implementation: open, setup: "awaiting" });
  assert.equal(combined.total, 1);
  assert.deepEqual(combined.rows.map(row => row.id), [awaiting.facility.id]);
  const acknowledged = await loadHarborCustomerDirectoryPage(db, { query: prefix, implementation: open, setup: "acknowledged" });
  assert.equal(acknowledged.total, 1);
  assert.deepEqual(acknowledged.rows.map(row => row.id), [assigned.facility.id]);
  const today = await loadHarborToday(db);
  assert.ok(today.setupFollowUp.total >= 201, "The Today total must include all 201 pending fixtures even though its preview is bounded");
  assert.equal(today.setupFollowUp.rows.length, 5);
  const empty = await loadHarborCustomerDirectoryPage(db, { query: `${prefix} D Accepted`, implementation: unassigned, page: "9" });
  assert.deepEqual(empty, { rows: [], total: 0, page: 1, pageCount: 1, offset: 0 });
  await assert.rejects(() => loadHarborCustomerDirectoryPage(db, {
    query: prefix, implementation: { filter: "unassigned", actor: legacy }, page: "2",
  }), /Exit the Facility work session/);
}));

test("SQL assignment: records the locked previous staff and Facility without expanding customer or Support history", { skip }, () => run(async db => {
  const f = await fixture(db);
  const customer: Actor = { kind: "customer", session: f.session };
  async function staffActor(role: "OWNER" | "MEMBER") {
    const staff = await db.platformStaff.create({
      data: { email: `assignment-${randomUUID()}@example.invalid`, displayName: role, passwordHash: "no-login", role },
    });
    const token = await createHarborSessionToken({
      uid: staff.id, name: staff.displayName, email: staff.email, staffRole: role, sessionVersion: staff.sessionVersion,
    });
    return { kind: "staff", session: await verifyHarborSessionToken(token), workFacilityId: null } as const;
  }
  const [owner, member, replacement, successor] = await Promise.all([
    staffActor("OWNER"), staffActor("MEMBER"), staffActor("MEMBER"), staffActor("MEMBER"),
  ]);
  const engagementId = await requestEngagement(db, customer, f.facility.id, {
    departmentKeys: ["DIETARY"], deliverables: ["Synthetic assignment evidence"],
  });
  const readEngagement = () => db.implementationEngagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: { participants: { orderBy: { id: "asc" } }, events: { orderBy: { id: "asc" } } },
  });
  const original = await readEngagement();
  const supportHistory = () => db.supportTicketEvent.findMany({
    where: { ticketId: original.supportTicketId }, orderBy: { id: "asc" },
  });
  const originalSupportHistory = await supportHistory();
  await assert.rejects(assignEngagement(db, customer, engagementId, member.session.uid), /Console staff action/);
  await assert.rejects(assignEngagement(db, member, engagementId, replacement.session.uid), /Owner/);
  assert.deepEqual(await readEngagement(), original);

  await assignEngagement(db, member, engagementId, member.session.uid);
  const claimed = await readEngagement();
  const claim = claimed.events.find(event => event.kind === "ASSIGNED");
  assert.equal(claim?.actorStaffId, member.session.uid);
  assert.deepEqual(claim?.data, {
    responsibleStaffId: member.session.uid, previousResponsibleStaffId: null, facilityId: f.facility.id,
  });
  await assert.rejects(assignEngagement(db, member, engagementId, replacement.session.uid), /Owner/);
  assert.deepEqual(await readEngagement(), claimed);

  // Pause the first assignment before its event insert. The second call observes the old
  // committed assignment at its initial lookup and must re-read after obtaining the locks.
  let observeFirstWrite!: () => void;
  let releaseFirstWrite!: () => void;
  let observeSecondRead!: (staffId: string | null) => void;
  const firstWriting = new Promise<void>(resolve => { observeFirstWrite = resolve; });
  const firstCanCommit = new Promise<void>(resolve => { releaseFirstWrite = resolve; });
  const secondRead = new Promise<string | null>(resolve => { observeSecondRead = resolve; });
  const firstDb = db.$extends({ query: { implementationEvent: {
    async create({ args, query }) {
      if (args.data.kind === "ASSIGNED") {
        observeFirstWrite();
        await firstCanCommit;
      }
      return query(args);
    },
  } } }) as unknown as PrismaClient;
  let observed = false;
  const secondDb = db.$extends({ query: { implementationEngagement: {
    async findUniqueOrThrow({ args, query }) {
      const row = await query(args);
      if (!observed) {
        observed = true;
        observeSecondRead(row.responsibleStaffId);
      }
      return row;
    },
  } } }) as unknown as PrismaClient;
  const first = assignEngagement(firstDb, owner, engagementId, replacement.session.uid);
  let second: Promise<void> | undefined;
  try {
    await Promise.race([firstWriting, first.then(() => assert.fail("First assignment did not wait at its event write"))]);
    second = assignEngagement(secondDb, owner, engagementId, successor.session.uid);
    assert.equal(await Promise.race([
      secondRead, second.then(() => assert.fail("Second assignment did not read the engagement")),
    ]), member.session.uid);
  } finally {
    releaseFirstWrite();
    await Promise.allSettled(second ? [first, second] : [first]);
  }
  await first;
  await second;

  const assigned = await readEngagement();
  assert.equal(assigned.deliveryRevision, original.deliveryRevision + 3);
  assert.equal(assigned.responsibleStaffId, successor.session.uid);
  assert.deepEqual(assigned.participants.map(({ staffId, userId }) => staffId ?? userId).sort(),
    [f.user.id, member.session.uid, owner.session.uid, replacement.session.uid, successor.session.uid].sort());
  const staffView = await getEngagement(db, owner, engagementId);
  const customerView = await getEngagement(db, customer, engagementId);
  const staffEvents = staffView.events.filter(event => event.kind === "ASSIGNED");
  const customerEvents = customerView.events.filter(event => event.kind === "ASSIGNED");
  assert.equal(staffEvents.length, 3);
  assert.deepEqual(staffEvents.find(event => event.actorStaffId === owner.session.uid &&
    (event.data as { responsibleStaffId: string }).responsibleStaffId === replacement.session.uid)?.data, {
    responsibleStaffId: replacement.session.uid, previousResponsibleStaffId: member.session.uid, facilityId: f.facility.id,
  });
  assert.deepEqual(staffEvents.find(event => event.actorStaffId === owner.session.uid &&
    (event.data as { responsibleStaffId: string }).responsibleStaffId === successor.session.uid)?.data, {
    responsibleStaffId: successor.session.uid, previousResponsibleStaffId: replacement.session.uid, facilityId: f.facility.id,
  });
  assert.deepEqual(customerEvents.sort((a, b) => a.id.localeCompare(b.id)), staffEvents.map(event => ({
    ...event, data: { responsibleStaffId: (event.data as { responsibleStaffId: string }).responsibleStaffId },
  })).sort((a, b) => a.id.localeCompare(b.id)));
  assert.deepEqual(await supportHistory(), originalSupportHistory);

  const readTicket = () => db.supportTicket.findUniqueOrThrow({ where: { id: original.supportTicketId } });
  const assignedTicket = await readTicket();
  assert.equal(assignedTicket.assignedStaffId, successor.session.uid);
  const [newActor, newAssignee] = await Promise.all([staffActor("OWNER"), staffActor("MEMBER")]);
  const failingDb = db.$extends({ query: { implementationEvent: {
    async create({ args, query }) {
      if (args.data.kind === "ASSIGNED") throw new Error("injected assignment event failure");
      return query(args);
    },
  } } }) as unknown as PrismaClient;
  await assert.rejects(assignEngagement(failingDb, newActor, engagementId, newAssignee.session.uid), /injected assignment event failure/);
  assert.deepEqual(await readEngagement(), assigned);
  assert.deepEqual(await readTicket(), assignedTicket);
  assert.deepEqual(await supportHistory(), originalSupportHistory);
}));

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
 const consoleWork={ jti: randomUUID(),...f.session,uid:f.owner.id,authKind:"harbor_staff"} as FacilitySession;await assert.rejects(()=>getImportResults(db,consoleWork,preview.batchId),/actor\/Facility/);
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
 await assert.rejects(()=>assignEngagement(db,f.s,f.id,f.owner.id),/accepted/);
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
 assert.deepEqual(await reconcileImplementationPayment({db,stripe:p.stripe},f.s,f.id,f.order.id),{status:"PAID",url:null});
 assert.equal(await db.implementationEvent.count({where:{engagementId:f.id,kind:"PAYMENT_RECONCILED"}}),0);
 assert.equal(p.creates,1);assert.equal((await db.implementationOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,"PAID");assert.equal(await db.implementationEvent.count({where:{engagementId:f.id,kind:"PAYMENT_SETTLED"}}),1);assert.equal(await db.implementationPaymentAttempt.count({where:{orderId:f.order.id}}),1);
 assert.equal((await db.facilityBilling.findUniqueOrThrow({where:{facilityId:f.facility.id}})).stripeSubscriptionId,null,"service does not create a subscription");
}));
test("SQL payment: staff reconciliation attributes only persisted transitions and keeps customer settlement history", { skip }, () => run(async db => {
  const f = await setup(db), other = await setup(db), p = provider();
  await approveQuote(db, f.c, f.id, f.order.id, f.order.digest);
  await db.facility.update({ where: { id: f.facility.id }, data: { stripeCustomerId: "cus_existing" } });
  const member = await db.platformStaff.create({ data: { email: `billing-reviewer-${randomUUID()}@example.com`, displayName: "Billing reviewer", passwordHash: "no-login", role: "MEMBER" } });
  const reviewer: Actor = { kind: "staff", session: await verifyHarborSessionToken(await createHarborSessionToken({
    uid: member.id, email: member.email, name: member.displayName, staffRole: member.role, sessionVersion: member.sessionVersion,
  })), workFacilityId: null };
  const deps = { db, stripe: p.stripe };
  const events = () => db.implementationEvent.findMany({ where: { engagementId: f.id, kind: "PAYMENT_RECONCILED" } });
  assert.deepEqual(await reconcileImplementationPayment(deps, f.s, f.id, f.order.id), { status: "NOT_STARTED", url: null });
  await prepare(db, f, p);
  const paymentAttempt = () => db.implementationPaymentAttempt.findFirstOrThrow({ where: { orderId: f.order.id } });
  const attempt = await paymentAttempt();
  await assert.rejects(() => reconcileImplementationPayment(deps, reviewer, f.id, f.order.id), /explicitly recorded participation/);
  await assert.rejects(() => reconcileImplementationPayment(deps, f.s, f.id, other.order.id), /outside this engagement/);
  await assert.rejects(() => reconcileImplementationPayment(deps, other.c, f.id, f.order.id), /intended Facility/);
  assert.deepEqual(await paymentAttempt(), attempt);
  assert.deepEqual(await events(), []);
  await db.implementationParticipant.create({ data: { engagementId: f.id, staffId: member.id } });

  // Even with the retry argument, staff may only observe existing provider evidence.
  assert.deepEqual(await reconcileImplementationPayment(deps, reviewer, f.id, f.order.id, true), { status: "UNKNOWN", url: null });
  assert.deepEqual(await reconcileImplementationPayment(deps, reviewer, f.id, f.order.id), { status: "UNKNOWN", url: null });
  assert.equal(p.creates, 0);
  assert.equal(await db.implementationPaymentAttempt.count({ where: { orderId: f.order.id } }), 1);
  assert.equal((await paymentAttempt()).status, "UNKNOWN");

  p.loseResponse(); // Customer initiation leaves real provider evidence in the double but no local checkout receipt.
  assert.equal((await reconcileImplementationPayment(deps, f.c, f.id, f.order.id, true)).status, "UNKNOWN");
  const remote = [...p.sessions.values()][0]!;
  const open = { status: "OPEN", url: remote.url, sessionId: remote.id };
  assert.deepEqual(await reconcileImplementationPayment(deps, reviewer, f.id, f.order.id), open);
  assert.deepEqual(await reconcileImplementationPayment(deps, reviewer, f.id, f.order.id), open);
  assert.deepEqual(await reconcileImplementationPayment(deps, f.c, f.id, f.order.id), open);
  assert.equal((await paymentAttempt()).checkoutUrl, remote.url);

  const paid = p.paid();
  const settled = await Promise.all([
    reconcileImplementationPayment(deps, reviewer, f.id, f.order.id),
    reconcileImplementationPayment(deps, reviewer, f.id, f.order.id),
  ]);
  assert.equal(settled.filter(r => r.status === "PAID").length, 2);
  assert.equal(settled.filter(r => "sessionId" in r && r.sessionId === paid.id).length, 1);
  assert.equal(await handleImplementationCheckout(deps, paid), true);
  assert.deepEqual(await reconcileImplementationPayment(deps, f.c, f.id, f.order.id), { status: "PAID", url: null });
  assert.equal(p.creates, 1);
  assert.equal((await paymentAttempt()).status, "PAID");
  assert.equal((await paymentAttempt()).checkoutUrl, null);
  assert.equal((await db.implementationOrder.findUniqueOrThrow({ where: { id: f.order.id } })).status, "PAID");

  const records = await events();
  assert.equal(records.length, 3);
  for (const [previousStatus, newStatus] of [["PREPARED", "UNKNOWN"], ["UNKNOWN", "OPEN"], ["OPEN", "PAID"]]) {
    const expected = { facilityId: f.facility.id, orderId: f.order.id, attemptId: attempt.id, previousStatus, newStatus };
    const row = records.find(e => (e.data as { previousStatus: string }).previousStatus === previousStatus)!;
    assert.deepEqual(row?.data, expected);
    assert.equal(row.actorKind, "staff");
    assert.equal(row.actorStaffId, member.id);
    assert.equal(row.actorUserId, null);
    assert.equal(row.providerEventId, null);
  }
  const staffView = await getEngagement(db, reviewer, f.id);
  assert.equal(staffView.events.filter(e => e.kind === "PAYMENT_RECONCILED").length, 3);
  const customerView = await getEngagement(db, f.c, f.id);
  assert.ok(!JSON.stringify(customerView).includes("PAYMENT_RECONCILED"));
  assert.equal(customerView.orders[0]?.attempts[0]?.status, "PAID");
  const providerEvents = customerView.events.filter(e => e.kind === "PAYMENT_SETTLED");
  assert.equal(providerEvents.length, 1);
  assert.equal(providerEvents[0]!.actorKind, "provider");
  assert.deepEqual(providerEvents[0]!.data, {
    orderId: f.order.id, attemptId: attempt.id, sessionId: paid.id,
    paymentIntentId: paid.payment_intent, amountCents: f.order.amountCents, currency: f.order.currency,
  });
}));

test("SQL payment: failed staff audit or persistence rolls back UNKNOWN and PAID reconciliation", { skip }, () => run(async db => {
  const f = await setup(db), p = provider();
  await approveQuote(db, f.c, f.id, f.order.id, f.order.digest);
  await db.facility.update({ where: { id: f.facility.id }, data: { stripeCustomerId: "cus_existing" } });
  await prepare(db, f, p);
  const snapshot = () => db.implementationOrder.findUniqueOrThrow({
    where: { id: f.order.id },
    include: { attempts: true, engagement: { include: { events: { orderBy: { id: "asc" } } } } },
  });
  const before = await snapshot();
  const badAudit = db.$extends({ query: { implementationEvent: {
    async create({ args, query }) {
      if (args.data.kind === "PAYMENT_RECONCILED") throw Error("injected staff audit failure");
      return query(args);
    },
  } } }) as unknown as PrismaClient;
  const badProvider = provider();
  badProvider.listFailure();
  for (const stripe of [p.stripe, badProvider.stripe]) {
    await assert.rejects(() => reconcileImplementationPayment({ db: badAudit, stripe }, f.s, f.id, f.order.id), /staff audit failure/);
    assert.deepEqual(await snapshot(), before);
  }
  let failUpdate = true;
  const badWrite = db.$extends({ query: { implementationPaymentAttempt: {
    async update({ args, query }) {
      if (failUpdate) { failUpdate = false; throw Error("injected attempt persistence failure"); }
      return query(args);
    },
  } } }) as unknown as PrismaClient;
  await assert.rejects(() => reconcileImplementationPayment({ db: badWrite, stripe: p.stripe }, f.s, f.id, f.order.id), /attempt persistence failure/);
  assert.deepEqual(await snapshot(), before);

  await reconcileImplementationPayment({ db, stripe: p.stripe }, f.c, f.id, f.order.id, true);
  const open = await snapshot();
  const remote = p.paid();
  await assert.rejects(() => reconcileImplementationPayment({ db: badAudit, stripe: p.stripe }, f.s, f.id, f.order.id), /staff audit failure/);
  assert.deepEqual(await snapshot(), open, "order, attempt, and provider settlement event must all roll back");
  assert.equal((await reconcileImplementationPayment({ db, stripe: p.stripe }, f.s, f.id, f.order.id)).status, "PAID");
  assert.equal(await handleImplementationCheckout({ db, stripe: p.stripe }, remote), true);
  const settled = await snapshot();
  assert.equal(settled.engagement.events.filter(e => e.kind === "PAYMENT_SETTLED").length, 1);
  assert.equal(settled.engagement.events.filter(e => e.kind === "PAYMENT_RECONCILED").length, 1);
  assert.equal(p.creates, 1);
  assert.equal(badProvider.creates, 0);
}));

test("SQL payment: failed history scan or unknown attempt beyond replay window never creates a new charge",{skip},()=>run(async db=>{
 const f=await setup(db),p=provider();await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);await db.facility.update({where:{id:f.facility.id},data:{stripeCustomerId:"cus_existing"}});await prepare(db,f,p);p.listFailure();assert.equal((await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true)).status,"UNKNOWN");assert.equal(p.creates,0);
 const clean=provider();assert.equal((await reconcileImplementationPayment({db,stripe:clean.stripe,now:()=>new Date(Date.now()+13*3600*1000)},f.c,f.id,f.order.id,true)).status,"UNKNOWN");assert.equal(clean.creates,0);await prepare(db,f,clean);assert.equal(await db.implementationPaymentAttempt.count({where:{orderId:f.order.id}}),1);
}));
test("SQL payment: mismatched amount/customer blocks reconciliation; positively expired unpaid attempt permits a distinct safe attempt",{skip},()=>run(async db=>{
 const f=await setup(db),p=provider();await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);await db.facility.update({where:{id:f.facility.id},data:{stripeCustomerId:"cus_existing"}});await prepare(db,f,p);await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true);
 const session=[...p.sessions.values()][0]!;session.amount_total=1;assert.deepEqual(await reconcileImplementationPayment({db,stripe:p.stripe},f.s,f.id,f.order.id),{status:"UNKNOWN",url:null,message:"Provider scope, customer or amount does not match the approved service order. No additional charge will be created."});assert.equal((await db.implementationPaymentAttempt.findFirstOrThrow({where:{orderId:f.order.id}})).checkoutUrl,null);assert.equal((await db.implementationOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,"APPROVED");session.amount_total=200000;session.status="expired";assert.equal((await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id)).status,"EXPIRED");await prepare(db,f,p);assert.equal(await db.implementationPaymentAttempt.count({where:{orderId:f.order.id}}),2);await reconcileImplementationPayment({db,stripe:p.stripe},f.c,f.id,f.order.id,true);assert.equal(p.creates,2);
}));

test("SQL service: original staff actor can still share historical receipts outside work",{skip},()=>run(async db=>{
 const f=await setup(db,true);await approveQuote(db,f.c,f.id,f.order.id,f.order.digest);
 const csv=f.workforce(),preview=await f.preview("workforce",csv);await f.confirm(preview,csv);
 // Model a persisted pre-retirement receipt without executing as legacy staff.
 await db.setupImportBatch.update({where:{id:preview.batchId},data:{
   actorKind:"harbor_staff",actorUserId:null,actorStaffId:f.owner.id,
   actorSnapshot:{kind:"harbor_staff",id:f.owner.id,role:f.owner.role},
 }});
 await assert.rejects(
   () => getImportResults(db, {...f.session,uid:f.owner.id,authKind:"harbor_staff"}, preview.batchId),
   /internal Facility Administrator/,
 );
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

test("SQL Console downloads enforce the same source authority and preserve ordinary Support downloads", { skip }, () => run(async (db) => {
  const { readConsoleSupportAttachment } = await import("@/lib/support/download");
  const { readImplementationSource } = await import("./service");
  const engagement = await setup(db);
  const unrelated = await setup(db);
  const store = createMemorySupportAttachmentStore();
  const bytes = Buffer.from("synthetic implementation source");
  const source = await receiveSource(db, engagement.c, engagement.id, {
    submissionId: randomUUID(), filename: "source.csv", contentType: "text/csv", bytes,
  }, store);
  const original = source.attachments[0]!;
  const verified = await db.supportTicketAttachment.update({ where: { id: original.id }, data: { scanStatus: "CLEAN" } });

  assert.equal((await readConsoleSupportAttachment(db, unrelated.s, original.id, store)).outcome, "forbidden");
  assert.equal((await readConsoleSupportAttachment(db, { ...engagement.s, workFacilityId: engagement.facility.id }, original.id, store)).outcome, "forbidden");
  await assert.rejects(() => readImplementationSource(db, unrelated.s, unrelated.id, original.id, store), /quarantined/);
  await assert.rejects(() => readImplementationSource(db, engagement.c, engagement.id, original.id, store), /Console staff/);
  const authorized = await readConsoleSupportAttachment(db, engagement.s, original.id, store);
  assert.equal(authorized.outcome, "ok");
  if (authorized.outcome === "ok") assert.deepEqual(Buffer.from(authorized.file.bytes), bytes);

  const note = await db.supportTicketMessage.create({
    data: { ticketId: source.ticketId, kind: "NOTE", authorStaffId: engagement.owner.id, bodyText: "Ordinary support material" },
  });
  await store.put({ key: "fixture-ordinary-support", bytes, contentType: original.contentType });
  const ordinary = await db.supportTicketAttachment.create({
    data: {
      messageId: note.id, position: 0, filename: original.filename, contentType: original.contentType,
      sizeBytes: original.sizeBytes, scanStatus: "CLEAN",
      storageKey: "fixture-ordinary-support", checksumSha256: verified.checksumSha256,
    },
  });
  assert.equal((await readConsoleSupportAttachment(db, unrelated.s, ordinary.id, store)).outcome, "ok");
  await assert.rejects(() => readImplementationSource(db, engagement.s, engagement.id, ordinary.id, store), /quarantined/);

  await db.implementationParticipant.deleteMany({ where: { engagementId: engagement.id, staffId: engagement.owner.id } });
  assert.equal((await readConsoleSupportAttachment(db, engagement.s, original.id, store)).outcome, "forbidden");
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
