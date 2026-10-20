import { traceDisposableTransactions } from "@/lib/verify/trace-disposable-transactions";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, RoleKey } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { applyFacilitySubscription } from "@/lib/billing/apply-stripe-event";
import { activateInvitedAccount } from "@/lib/account-invite/activate";
import { onboardFacilityEmployee } from "@/lib/employee-identity/onboard";
import { previewImport, confirmImport, getImportResults } from "./service";
import { deliverImportActivation } from "./activation";
import { loadCatalog } from "./catalog";
import { parseSource, readReview, signReview, type Dataset, type Preview } from "./contract";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
const skip = !url;
process.env.AUTH_SECRET ||= "onb04-sql-review-secret";
async function run(body: (db: PrismaClient) => Promise<void>) { const db = traceDisposableTransactions(new PrismaClient({ datasources: { db: { url: url! } } }), "setup-imports"); try { await body(db); } finally { await db.$disconnect(); } }
async function fixture(db: PrismaClient, organizationId?: string) {
  const id = randomUUID();
  for (const key of Object.values(RoleKey)) await db.role.upsert({ where: { key }, create: { key, name: key }, update: {} });
  const role = await db.role.findUniqueOrThrow({ where: { key: "FACILITY_ADMINISTRATOR" } });
  const org = organizationId ? { id: organizationId } : await db.organization.create({ data: { name: `ONB04 ${id}`, organizationType: "LONG_TERM_CARE" } });
  const facility = await db.facility.create({ data: { organizationId: org.id, displayName: `ONB04 ${id}`, timezone: "America/New_York" } });
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

test("SQL: preview is pure; confirmed workforce creates one email-linked pending identity and normal credential enforcement remains",{ skip },()=>run(async db=>{
  const f=await fixture(db), csv=f.workforce();
  // Other concurrent suites create/clean their own accounts. Assert the complete
  // reviewed Facility/identity footprint, rather than a changing global count.
  const footprint=async()=>({ users:await db.user.count({where:{OR:[{facilityId:f.facility.id},{email:f.email}]}}),employees:await db.employee.count({where:{facilityId:f.facility.id}}),grants:await db.userFacilityAccess.count({where:{facilityId:f.facility.id}}),batches:await db.setupImportBatch.count({where:{facilityId:f.facility.id}}),invites:await db.accountInviteToken.count({where:{user:{OR:[{facilityId:f.facility.id},{email:f.email}]}}}) });
  const before=await footprint();
  const p=await f.preview("workforce",csv);assert.equal(p.rows[0]!.action,"create");
  assert.deepEqual(await footprint(),before);
  const result=await f.confirm(p,csv);assert.equal(result.rows[0]!.result?.status,"committed");
  const ids=result.rows[0]!.result!.targetIds, e=await db.employee.findUniqueOrThrow({ where:{id:ids.employeeId},include:{user:true} });
  assert.equal(e.userId,ids.userId);assert.equal(e.pinDigest,null);assert.equal(e.user!.passwordHash,null);assert.equal(e.user!.emailVerifiedAt,null);assert.equal(e.employmentType,"PART_TIME");
  assert.match(result.rows[0]!.enrollment!.pin,/pending/);assert.equal(result.rows[0]!.enrollment!.account,"activation_pending");
  assert.equal(await db.userFacilityAccess.count({where:{userId:ids.userId,facilityId:f.facility.id,isActive:true}}),1);
  await assert.rejects(()=>onboardFacilityEmployee(db,{facilityId:f.facility.id,actorUserId:f.user.id,email:`manual-${f.email}`,firstName:"Manual",lastName:"Person",roleType:"STAFF",employmentType:"FULL_TIME",status:"ACTIVE",confirmExistingUser:false}),/PIN is required/);
  const receipt=await db.setupImportBatch.findUniqueOrThrow({where:{id:p.batchId}});assert.equal(receipt.actorUserId,f.user.id);assert.equal(receipt.actorStaffId,null);
  assert.ok(!JSON.stringify(receipt.reviewedPlan).includes("passwordHash"));assert.ok(!JSON.stringify(receipt.reviewedPlan).includes("pinDigest"));
}));

test("SQL: account activation/retry uses canonical tokens, preserves credentials and concurrent acceptance cannot reset a password",{skip},()=>run(async db=>{
  const f=await fixture(db),csv=f.workforce(),p=await f.preview("workforce",csv);const r=await f.confirm(p,csv);
  const input={batchId:p.batchId,row:2,origin:"https://test.example"};
  assert.equal((await deliverImportActivation(db,f.session,input,{configured:()=>false})).status,"not_configured");
  assert.equal((await deliverImportActivation(db,f.session,input,{configured:()=>true,send:async()=>{throw Error("simulated delivery failure");}})).status,"delivery_failed");
  let invite="";assert.equal((await deliverImportActivation(db,f.session,input,{configured:()=>true,send:async v=>{invite=v.inviteUrl;return {sent:true,messageId:"captured"};}})).status,"sent");
  const token=new URL(invite).searchParams.get("token")!;
  const accepted=await Promise.allSettled([activateInvitedAccount(db,token,"password-one"),activateInvitedAccount(db,token,"password-two")]);assert.equal(accepted.filter(x=>x.status==="fulfilled").length,1);
  const user=await db.user.findUniqueOrThrow({where:{id:r.rows[0]!.result!.targetIds.userId}});assert.ok(["password-one","password-two"].includes(user.passwordHash!));assert.ok(user.emailVerifiedAt);
  await assert.rejects(()=>activateInvitedAccount(db,token,"overwrite"));
  assert.equal((await deliverImportActivation(db,f.session,input,{configured:()=>true,send:async()=>{throw Error("must not send");}})).status,"not_needed");
  assert.equal((await db.user.findUniqueOrThrow({where:{id:user.id}})).passwordHash,user.passwordHash);
  const e=await db.employee.findUniqueOrThrow({where:{id:r.rows[0]!.result!.targetIds.employeeId}});assert.equal(e.pinDigest,null);
}));

test("SQL: same global person across Facilities requires explicit account match and never overwrites global/home credentials",{skip},()=>run(async db=>{
  const a=await fixture(db),csv=a.workforce(),p=await a.preview("workforce",csv),r=await a.confirm(p,csv),uid=r.rows[0]!.result!.targetIds.userId!;
  await db.user.update({where:{id:uid},data:{passwordHash:"preserve-password",emailVerifiedAt:new Date()}});
  const b=await fixture(db,a.org.id),second=b.workforce(a.email),q=await b.preview("workforce",second);assert.equal(q.rows[0]!.requiresAccountConfirmation,uid);
  const denied=await b.confirm(q,second);assert.equal(denied.rows[0]!.result?.status,"blocked");assert.equal(await db.employee.count({where:{facilityId:b.facility.id,email:a.email}}),0);
  const before=await db.user.findUniqueOrThrow({where:{id:uid}});const accepted=await b.confirm(q,undefined,[2]);assert.equal(accepted.rows[0]!.result?.status,"committed");
  assert.deepEqual(await db.user.findUniqueOrThrow({where:{id:uid}}),before);assert.equal(await db.user.count({where:{email:a.email}}),1);assert.equal(await db.employee.count({where:{userId:uid}}),2);
  const other=await fixture(db),cross=await other.preview("workforce",other.workforce(a.email));assert.equal(cross.rows[0]!.action,"blocked");assert.match(cross.rows[0]!.message,/Organization/);
}));

test("SQL: create/reuse is distinct from ONB-01 updates and rejects ambiguous, revoked and historical identities",{skip},()=>run(async db=>{
  const f=await fixture(db),csv=f.workforce(),p=await f.preview("workforce",csv),r=await f.confirm(p,csv),eid=r.rows[0]!.result!.targetIds.employeeId!,uid=r.rows[0]!.result!.targetIds.userId!;
  await db.employee.update({where:{id:eid},data:{phone:"preserve",unionMember:true,hrNotes:"keep"}});
  const before=await db.employee.findUniqueOrThrow({where:{id:eid}}),q=await f.preview("workforce",csv);assert.equal(q.rows[0]!.action,"reuse");const reuse=await f.confirm(q,csv,[2]);assert.equal(reuse.rows[0]!.result?.status,"reused");assert.deepEqual(await db.employee.findUniqueOrThrow({where:{id:eid}}),before);
  assert.equal((await f.preview("workforce",csv.replace("Casey","Changed"))).rows[0]!.action,"blocked");
  await db.employee.create({data:{facilityId:f.facility.id,email:f.email,firstName:"Duplicate",lastName:"Contact",roleType:"STAFF",employmentType:"FULL_TIME",status:"ACTIVE"}});
  assert.match((await f.preview("workforce",csv)).rows[0]!.message,/Ambiguous/);
  await db.employee.updateMany({where:{facilityId:f.facility.id,email:f.email},data:{email:null}});
  await db.employee.update({where:{id:eid},data:{email:f.email,status:"TERMINATED",terminationDate:new Date()}});
  assert.match((await f.preview("workforce",csv)).rows[0]!.message,/lifecycle/);
  await db.employee.update({where:{id:eid},data:{status:"ACTIVE",terminationDate:null}});
  await db.userFacilityAccess.updateMany({where:{userId:uid,facilityId:f.facility.id},data:{isActive:false,revokedAt:new Date()}});
  assert.match((await f.preview("workforce",csv)).rows[0]!.message,/historical access|lifecycle/);
}));

test("SQL: one person joins two Departments/Teams/Job Roles without replacing HR or other relationships",{skip},()=>run(async db=>{
  const f=await fixture(db);
  const dietaryTeam=await db.departmentTeam.create({data:{facilityId:f.facility.id,departmentId:f.dietary.id,displayName:"Food team"}}),plantTeam=await db.departmentTeam.create({data:{facilityId:f.facility.id,departmentId:f.plant.id,displayName:"Plant team"}});
  const dietaryRole=await db.departmentJobRole.create({data:{facilityId:f.facility.id,departmentId:f.dietary.id,displayName:"Food role",tier:"TEAM_MEMBER"}}),plantRole=await db.departmentJobRole.create({data:{facilityId:f.facility.id,departmentId:f.plant.id,displayName:"Plant role",tier:"TEAM_MEMBER"}});
  const title=await db.jobTitle.create({data:{facilityId:f.facility.id,name:"Shared staff"}});
  const csv=f.workforce(f.email,`teamId,jobRoleId,jobTitleId\n${dietaryTeam.id},${dietaryRole.id},${title.id}`),p=await f.preview("workforce",csv),r=await f.confirm(p,csv),eid=r.rows[0]!.result!.targetIds.employeeId!;
  await db.employee.update({where:{id:eid},data:{phone:"keep",hrNotes:"retained"}});
  const rel=`employeeId,department,membership,teamId,teamPrimary,jobRoleId\n${eid},PLANT,ADDITIONAL,${plantTeam.id},true,${plantRole.id}\n`;
  const q=await f.preview("employee_departments",rel);assert.equal(q.rows[0]!.action,"add");const result=await f.confirm(q,rel);assert.equal(result.rows[0]!.result?.status,"committed");
  const employee=await db.employee.findUniqueOrThrow({where:{id:eid},include:{employeeDepartments:true,teamMemberships:true,departmentJobRoles:true}});
  assert.equal(employee.primaryDepartmentId,f.dietary.id);assert.deepEqual(employee.employeeDepartments.map(x=>x.departmentId),[f.plant.id]);assert.equal(employee.teamMemberships.length,2);assert.equal(employee.departmentJobRoles.length,2);assert.equal(employee.jobTitleId,title.id);assert.equal(employee.hrNotes,"retained");assert.equal(employee.phone,"keep");assert.equal(employee.roleType,"STAFF");
  assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);
  const again=await f.confirm(q);assert.equal(again.rows[0]!.result?.status,"committed");assert.equal(await db.setupImportResult.count({where:{batchId:q.batchId,phase:"IMPORT"}}),1);
}));

test("SQL: Department location CSV shares one physical place and preserves existing responsibility settings",{skip},()=>run(async db=>{
  const f=await fixture(db),before=await db.unitSpace.findUniqueOrThrow({where:{id:f.room.id}});
  const csv=`department,locationType,locationId,kind\nDIETARY,ROOM,${f.room.id},\nPLANT,ROOM,${f.room.id},\nPLANT,UNIT,${f.unit.id},PRIMARY\n`,p=await f.preview("department_locations",csv),r=await f.confirm(p,csv);assert.ok(r.rows.every(x=>x.result?.status==="committed"));
  assert.equal(await db.unitSpaceResponsibility.count({where:{spaceId:f.room.id}}),2);assert.deepEqual(await db.unitSpace.findUniqueOrThrow({where:{id:f.room.id}}),before);
  await db.unitSpaceResponsibility.updateMany({where:{spaceId:f.room.id,departmentId:f.plant.id},data:{capabilities:["preserve-this-existing-setting"]}});
  const q=await f.preview("department_locations",`department,locationType,locationId\nPLANT,ROOM,${f.room.id}\n`);const reuse=await f.confirm(q,`department,locationType,locationId\nPLANT,ROOM,${f.room.id}\n`);assert.equal(reuse.rows[0]!.result?.status,"reused");
  assert.deepEqual((await db.unitSpaceResponsibility.findUniqueOrThrow({where:{spaceId_departmentId:{spaceId:f.room.id,departmentId:f.plant.id}}})).capabilities,["preserve-this-existing-setting"]);
  assert.equal(await db.departmentOperationalProfile.count({where:{facilityId:f.facility.id,status:"ACTIVE"}}),0);
}));

test("SQL: stale source/review/actor/dependency and cross-Facility references cannot authorize creation",{skip},()=>run(async db=>{
  const f=await fixture(db),csv=f.workforce(),p=await f.preview("workforce",csv);
  await assert.rejects(()=>f.confirm(p,csv.replace("Casey","Other")),/Source file changed/);
  await assert.rejects(()=>confirmImport(db,f.session,{reviewToken:signReview({...readReview(p.reviewToken),expiresAt:Date.now()-1}),expectedFacilityId:f.facility.id,text:csv,fileName:p.fileName,confirmedAccountRows:[]}),/expired/);
  const other=await fixture(db);await assert.rejects(()=>confirmImport(db,{...f.session,facilityId:other.facility.id},{reviewToken:p.reviewToken,expectedFacilityId:f.facility.id,text:csv,fileName:p.fileName,confirmedAccountRows:[]}),/Facility changed/);
  const cross=await f.preview("department_locations",`department,locationType,locationId\nPLANT,ROOM,${other.room.id}\n`);assert.equal(cross.rows[0]!.action,"blocked");
  await db.department.update({where:{id:f.dietary.id},data:{isActive:false}});await assert.rejects(()=>f.confirm(p,csv),/Material facts changed/);assert.equal(await db.user.count({where:{email:f.email}}),0);
  await db.userFacilityAccess.update({where:{id:f.grant.id},data:{isActive:false,revokedAt:new Date()}});await assert.rejects(()=>f.confirm(p,csv),/authority|session/);
  assert.equal(await db.setupImportBatch.count({where:{id:p.batchId}}),0);
}));

test("SQL: Console work is attributed to PlatformStaff, never a User FK, and receipts are actor/Facility isolated",{skip},()=>run(async db=>{
  const f=await fixture(db),staff=await db.platformStaff.create({data:{email:`staff-${randomUUID()}@example.com`,displayName:"Console Staff",passwordHash:"existing-staff-password",role:"MEMBER"}});
  const session={...f.session,uid:staff.id,email:staff.email,name:staff.displayName,authKind:"harbor_staff",primaryDepartmentId:undefined} as FacilitySession;
  const csv=f.workforce(),p=await previewImport(db,session,{dataset:"workforce",text:csv,fileName:"workforce.csv",expectedFacilityId:f.facility.id});
  const r=await confirmImport(db,session,{reviewToken:p.reviewToken,expectedFacilityId:f.facility.id,text:csv,fileName:p.fileName,confirmedAccountRows:[]});assert.equal(r.rows[0]!.result?.status,"committed");
  const batch=await db.setupImportBatch.findUniqueOrThrow({where:{id:p.batchId}});assert.equal(batch.actorStaffId,staff.id);assert.equal(batch.actorUserId,null);
  const grant=await db.userFacilityAccess.findUniqueOrThrow({where:{userId_facilityId:{userId:r.rows[0]!.result!.targetIds.userId!,facilityId:f.facility.id}},include:{rolePeriods:true}});assert.equal(grant.grantedByUserId,null);assert.ok(grant.rolePeriods.every(x=>x.createdByUserId===null));
  assert.equal(await db.user.count({where:{id:staff.id}}),0);await assert.rejects(()=>getImportResults(db,f.session,p.batchId),/actor\/Facility/);
  await db.platformStaff.update({where:{id:staff.id},data:{sessionVersion:{increment:1}}});await assert.rejects(()=>getImportResults(db,session,p.batchId),/authority|session/);
}));

test("SQL: atomic row failure, immutable partial receipts and explicit retry create no duplicate identities",{skip},()=>run(async db=>{
  const f=await fixture(db),email2=`second-${f.email}`,csv=f.workforce()+f.workforce(email2).split("\n")[1]+"\n",p=await f.preview("workforce",csv);
  let fail=true;
  const faulty=db.$extends({query:{setupImportResult:{async create({args,query}){if(fail && args.data.phase==="IMPORT" && args.data.rowNumber===3 && args.data.status==="committed"){fail=false;throw Error("injected receipt failure");}return query(args);}}}}) as unknown as PrismaClient;
  const r=await confirmImport(faulty,f.session,{reviewToken:p.reviewToken,expectedFacilityId:f.facility.id,text:csv,fileName:p.fileName,confirmedAccountRows:[]});assert.deepEqual(r.rows.map(x=>x.result?.status),["committed","failed"]);
  assert.equal(await db.user.count({where:{email:email2}}),0);
  const retried=await f.confirm(p);assert.deepEqual(retried.rows.map(x=>x.result?.status),["committed","committed"]);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:{in:[f.email,email2]}}}),2);
  const history=await db.setupImportResult.findMany({where:{batchId:p.batchId,rowNumber:3,phase:"IMPORT"},orderBy:{attempt:"asc"}});assert.deepEqual(history.map(x=>x.status),["failed","committed"]);
  await f.confirm(p);assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"IMPORT"}}),3);
}));

test("SQL: concurrent/repeated confirmation and active execution lease prevent duplicate replay",{skip},()=>run(async db=>{
  const f=await fixture(db),csv=f.workforce(),p=await f.preview("workforce",csv);const races=await Promise.allSettled([f.confirm(p,csv),f.confirm(p,csv)]);assert.ok(races.some(x=>x.status==="fulfilled"));
  await assert.rejects(()=>f.confirm(p,csv+"\n"),/Source file changed/);
  await f.confirm(p);assert.equal(await db.user.count({where:{email:f.email}}),1);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"IMPORT"}}),1);
  await db.setupImportBatch.update({where:{id:p.batchId},data:{leaseToken:"simulated-running-worker",leaseExpiresAt:new Date(Date.now()+60_000)}});const running=await f.confirm(p);assert.equal(running.running,true);assert.match(running.message!,/running|executing/);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);
}));

test("SQL: authority expiring during a Facility lock wait is rechecked before committing",{skip},()=>run(async db=>{
  const f=await fixture(db),csv=f.workforce(),p=await f.preview("workforce",csv);
  await db.userFacilityRolePeriod.updateMany({where:{userFacilityAccessId:f.grant.id},data:{endsAt:new Date(Date.now()+700)}});
  let unlock!:()=>void,signal!:()=>void;const waiting=new Promise<void>(r=>signal=r),release=new Promise<void>(r=>unlock=r);
  const holder=db.$transaction(async tx=>{await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id"=${f.facility.id} FOR UPDATE`);signal();await release;},{timeout:10_000});await waiting;
  const pending=f.confirm(p,csv);await new Promise(r=>setTimeout(r,1000));unlock();await holder;await assert.rejects(()=>pending,/authority|session/);assert.equal(await db.user.count({where:{email:f.email}}),0);
}));

test("SQL: Asset responsibility/defaults, authority and licensing fail in preview; canonical register/replay preserves data/history",{skip},()=>run(async db=>{
  const f=await fixture(db),code=`AS-${randomUUID()}`,csv=`name,equipmentType,floor,neighborhood,space,assetCode\nShared cooler,Refrigerator,Floor 1,Shared Wing,Shared Room,${code}\n`;
  assert.equal((await f.preview("assets",csv)).rows[0]!.action,"blocked");
  await db.unitDepartmentResponsibility.create({data:{unitId:f.unit.id,departmentId:f.plant.id,kind:"PRIMARY"}});
  const p=await f.preview("assets",csv);assert.equal(p.rows[0]!.action,"create",p.rows[0]!.message);assert.equal(p.rows[0]!.operation!.departmentId,f.plant.id);
  const r=await f.confirm(p,csv);assert.equal(r.rows[0]!.result?.status,"committed");const asset=await db.asset.findUniqueOrThrow({where:{assetCode:code},include:{statusHistory:true}});assert.equal(asset.departmentId,f.plant.id);assert.equal(asset.spaceId,f.room.id);assert.equal(asset.statusHistory.length,1);assert.equal(asset.createdByUserId,f.user.id);
  await f.confirm(p);assert.equal(await db.asset.count({where:{assetCode:code}}),1);const q=await f.preview("assets",csv);assert.equal(q.rows[0]!.action,"reuse");assert.equal((await f.confirm(q,csv)).rows[0]!.result?.status,"reused");
  const restricted={...f.session,primaryDepartmentId:undefined};await assert.rejects(()=>previewImport(db,restricted,{dataset:"assets",text:csv,fileName:"assets.csv",expectedFacilityId:f.facility.id}),/Department authority changed/);
  await db.facilityBilling.update({where:{facilityId:f.facility.id},data:{status:"UNPAID"}});assert.equal((await f.preview("assets",csv)).rows[0]!.action,"blocked");assert.ok(await db.asset.findUnique({where:{id:asset.id}}));
}));


test("SQL: lost COMMIT response reconciles its atomic receipt before retry; bounded requests resume remaining rows",{skip},()=>run(async db=>{
  const f=await fixture(db),csv=f.workforce(),p=await f.preview("workforce",csv);
  let calls=0;
  const interrupted=new Proxy(db,{get(target,key){
    if(key==="$transaction") return async (...args: Parameters<typeof db.$transaction>)=>{
      const result=await (db.$transaction as (...v: unknown[])=>Promise<unknown>)(...args);
      if(++calls===2) throw Error("simulated response loss after real row COMMIT");
      return result;
    };
    const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
  }}) as PrismaClient;
  const r=await confirmImport(interrupted,f.session,{reviewToken:p.reviewToken,expectedFacilityId:f.facility.id,text:csv,fileName:p.fileName,confirmedAccountRows:[]});
  assert.equal(r.rows[0]!.result?.status,"committed");assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId}}),1);
  await f.confirm(p);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);
  const many=f.workforce().split("\n")[0]+"\n"+Array.from({length:31},(_,i)=>f.workforce(`chunk-${i}-${f.email}`).split("\n")[1]).join("\n")+"\n";
  const q=await f.preview("workforce",many),first=await f.confirm(q,many);assert.equal(first.rows.filter(x=>x.result?.status==="committed").length,25);assert.equal(first.rows.filter(x=>!x.result).length,6);
  const recovered=await getImportResults(db,f.session,q.batchId);assert.equal(recovered.rows.filter(x=>!x.result).length,6);
  const last=await f.confirm(q);assert.equal(last.rows.filter(x=>x.result?.status==="committed").length,31);
  await f.confirm(q);assert.equal(await db.setupImportResult.count({where:{batchId:q.batchId,phase:"IMPORT"}}),31);
}));


test("SQL: independent concurrent previews cannot auto-link a newly raced account; preserved inactive Job Title blocks in preview",{skip},()=>run(async db=>{
  const f=await fixture(db),csv=f.workforce(),a=await f.preview("workforce",csv),b=await f.preview("workforce",csv);
  const raced=await Promise.allSettled([f.confirm(a,csv),f.confirm(b,csv)]);assert.ok(raced.some(x=>x.status==="fulfilled"));
  const employee=await db.employee.findFirstOrThrow({where:{facilityId:f.facility.id,email:f.email}});
  assert.equal(await db.user.count({where:{email:f.email}}),1);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);
  assert.equal(await db.userFacilityAccess.count({where:{facilityId:f.facility.id,userId:employee.userId!}}),1);
  const title=await db.jobTitle.create({data:{facilityId:f.facility.id,name:"Archived title",isActive:false}});await db.employee.update({where:{id:employee.id},data:{jobTitleId:title.id}});
  const p=await f.preview("employee_departments",`employeeId,department,membership\n${employee.id},PLANT,ADDITIONAL\n`);assert.equal(p.rows[0]!.action,"blocked");assert.match(p.rows[0]!.message,/Job Title/);
  assert.equal((await db.employee.findUniqueOrThrow({where:{id:employee.id}})).jobTitleId,title.id);
}));


test("SQL: blocked/failed early rows cannot starve later unattempted rows during bounded recovery",{skip},()=>run(async db=>{
  const f=await fixture(db),header=f.workforce().split("\n")[0],bad=Array.from({length:25},(_,i)=>`blocked-${i}-${f.email},Blocked,Person,STAFF,PART_TIME,UNKNOWN_PRODUCT`);
  const csv=[header,...bad,f.workforce().split("\n")[1]].join("\n")+"\n",p=await f.preview("workforce",csv);
  const first=await f.confirm(p,csv);assert.equal(first.rows.filter(x=>x.result?.status==="blocked").length,25);assert.equal(first.rows[25]!.result,null);
  const second=await f.confirm(p);assert.equal(second.rows[25]!.result?.status,"committed");assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);
  await f.confirm(p);assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"IMPORT"}}),26);
}));

test("SQL: confirmed existing-account reuse survives a serialization rollback while waiting on its identity lock", { skip }, () => run(async db => {
  const a = await fixture(db), csv = a.workforce(), p = await a.preview("workforce", csv);
  const created = await a.confirm(p, csv), uid = created.rows[0]!.result!.targetIds.userId!;
  const b = await fixture(db, a.org.id), second = b.workforce(a.email), review = await b.preview("workforce", second);
  assert.equal(review.rows[0]!.requiresAccountConfirmation, uid);
  const before = await db.user.findUniqueOrThrow({ where: { id: uid } });
  let unlock!: () => void, held!: () => void;
  const locked = new Promise<void>(resolve => { held = resolve; });
  const release = new Promise<void>(resolve => { unlock = resolve; });
  let blocker: Promise<void> | undefined;
  let transactions = 0;
  const client = new Proxy(db, { get(target, key) {
    if (key === "$transaction") return async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { timeout?: number; maxWait?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => {
      // The durable claim has committed. Contend only with the actual row
      // transaction, so a missing retry yields an observable failed receipt.
      if (++transactions === 2) {
        blocker = db.$transaction(async tx => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${uid} FOR UPDATE`;
          await tx.user.update({ where: { id: uid }, data: { updatedAt: new Date() } });
          held(); await release;
        }, { timeout: 20000 });
        await locked;
      }
      return target.$transaction(work, options);
    };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  const confirmation = confirmImport(client, b.session, { reviewToken: review.reviewToken, expectedFacilityId: b.facility.id,
    text: second, fileName: review.fileName, confirmedAccountRows: [2] });
  await locked;
  try {
    const deadline = Date.now() + 10000;
    let waiting = false;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<Array<{waiting: boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%lower("email")%' AND pid<>pg_backend_pid()) AS waiting`;
      if (rows[0]?.waiting) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(waiting, true, "confirmation must actually wait on the locked global identity");
  } finally { unlock(); await blocker; }
  const result = await confirmation;
  assert.equal(result.rows[0]!.result?.status, "committed");
  const after = await db.user.findUniqueOrThrow({ where: { id: uid } });
  assert.deepEqual({ ...after, updatedAt: before.updatedAt }, before);
  assert.equal(await db.employee.count({ where: { userId: uid, facilityId: b.facility.id } }), 1);
  assert.equal(await db.setupImportResult.count({ where: { batchId: review.batchId, phase: "IMPORT", status: "committed" } }), 1);
}));


test("SQL: identity lookup uses exact email equality and retains ambiguous case variants", { skip }, () => run(async db => {
  const f = await fixture(db), email = `wild_%-${f.email}`;
  const role = await db.role.findUniqueOrThrow({ where: { key: "STAFF" } });
  const exact = await db.user.create({ data: { email, displayName: "Exact account", roleId: role.id, facilityId: f.facility.id } });
  await db.user.create({ data: { email: `wildXX-${f.email}`, displayName: "Other account", roleId: role.id, facilityId: f.facility.id } });
  const source = parseSource("workforce", f.workforce(email), "workforce.csv");
  const catalog = await loadCatalog(db, f.session, source);
  assert.deepEqual(catalog.users.map(u => u.id), [exact.id]);
  assert.equal((await f.preview("workforce", f.workforce(email))).rows[0]!.requiresAccountConfirmation, exact.id);
  await db.user.create({ data: { email: email.toUpperCase(), displayName: "Ambiguous case", roleId: role.id, facilityId: f.facility.id } });
  const ambiguous = await f.preview("workforce", f.workforce(email));
  assert.equal(ambiguous.rows[0]!.action, "blocked");
  assert.match(ambiguous.rows[0]!.message, /Ambiguous account email/);
}));
