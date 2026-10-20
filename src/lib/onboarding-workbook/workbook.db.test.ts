import { traceDisposableTransactions } from "@/lib/verify/trace-disposable-transactions";
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { Prisma, PrismaClient, RoleKey } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FacilitySession } from "@/lib/auth";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { applyFacilitySubscription } from "@/lib/billing/apply-stripe-event";
import { buildFacilityStructurePlanFromCsv, loadFacilityStructureCatalog, executeFacilityStructurePlan } from "@/lib/bulk-import/facility-structure-execute";
import { generateWorkbook, readWorkbook } from "./file";
import { previewWorkbook, confirmWorkbook, workbookResults } from "./service";
import { checkpoint, planWorkbook, workbookCatalog } from "./planning";
import { hash } from "@/lib/setup-imports/contract";
const url=process.env.ONBOARDING_TEST_DATABASE_URL;if(url)assertDisposableDatabaseUrl(url);const skip=!url;process.env.AUTH_SECRET||="onb06-isolated-secret";
async function run(fn:(db:PrismaClient)=>Promise<void>){const db=traceDisposableTransactions(new PrismaClient({datasources:{db:{url:url!}}}),"onboarding-workbook");try{await fn(db);}finally{await db.$disconnect();}}
async function fixture(db:PrismaClient){
  const id=randomUUID();for(const key of Object.values(RoleKey))await db.role.upsert({where:{key},create:{key,name:key},update:{}});
  const org=await db.organization.create({data:{name:`ONB06 ${id}`,organizationType:"LONG_TERM_CARE"}}),facility=await db.facility.create({data:{organizationId:org.id,displayName:"Workbook Facility",timezone:"America/New_York"}});
  await applyFacilitySubscription({facilityId:facility.id,status:"ACTIVE",departmentKeys:["DIETARY","PLANT"]},db);const departments=await db.department.findMany({where:{facilityId:facility.id}}),plant=departments.find(d=>d.key==="PLANT")!,role=await db.role.findUniqueOrThrow({where:{key:"FACILITY_ADMINISTRATOR"}});
  const user=await db.user.create({data:{email:`admin-${id}@example.com`,displayName:"Workbook Admin",facilityId:facility.id,primaryDepartmentId:plant.id,roleId:role.id,passwordHash:"existing-credential",emailVerifiedAt:new Date()}});
  const grant=await db.userFacilityAccess.create({data:{userId:user.id,facilityId:facility.id,rolePeriods:{create:{roleKey:"FACILITY_ADMINISTRATOR",startsAt:new Date(0)}}}});
  await db.employee.create({data:{facilityId:facility.id,userId:user.id,email:user.email,firstName:"Workbook",lastName:"Administrator",roleType:"FACILITY_ADMINISTRATOR",employmentType:"FULL_TIME",primaryDepartmentId:plant.id}});
  const session={uid:user.id,authKind:"user",authMethod:"PASSWORD",scopeKind:"facility",role:"FACILITY_ADMINISTRATOR",facilityId:facility.id,primaryDepartmentId:plant.id,name:user.displayName,email:user.email,sessionVersion:0} as FacilitySession;
  const email=`worker-${id}@example.com`,assetCode=`0012-${id.slice(0,8)}`;
  const add=(w:ExcelJS.Workbook,sheet:string,v:Record<string,unknown>)=>{const s=w.getWorksheet(sheet)!;s.addRow((s.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(h=>v[String(h)]??""));};
  async function workbook(fill?:(w:ExcelJS.Workbook)=>void){const w=new ExcelJS.Workbook();await w.xlsx.load(await generateWorkbook({facilityId:facility.id,name:facility.displayName,timezone:facility.timezone,departments,references:[],assets:true}) as unknown as ExcelJS.Buffer);if(fill)fill(w);else{
    add(w,"Locations",{rowRef:"room001",floor:"Floor 1",neighborhood:"Shared Wing",locationName:"Room 001",locationType:"Resident Room",roomNumber:"001"});
    add(w,"People",{rowRef:"p001",email,firstName:"Casey",lastName:"Worker",roleType:"STAFF",employmentType:"PART_TIME",primaryDepartment:"DIETARY",phone:"00123"});
    for(const department of ["DIETARY","PLANT"])add(w,"Department Locations",{rowRef:`dl-${department}`,department,locationType:"ROOM",locationId:"ref:room001"});
    add(w,"Department Memberships",{rowRef:"m001",employeeId:"ref:p001",department:"PLANT",membership:"ADDITIONAL"});
    add(w,"Assets",{rowRef:"a001",name:"Cold cabinet",equipmentType:"Refrigerator",assetCode,floor:"ref:room001",neighborhood:"ref:room001",space:"ref:room001",department:"PLANT"});
  }return Buffer.from(await w.xlsx.writeBuffer());}
  const preview=(bytes:Buffer,s=session)=>previewWorkbook(db,s,bytes,"setup.xlsx",facility.id);
  const confirm=(p:Awaited<ReturnType<typeof preview>>,bytes?:Buffer,accounts:number[]=[],client=db,s=session)=>confirmWorkbook(client,s,{reviewToken:p.reviewToken,expectedFacilityId:facility.id,bytes,fileName:bytes?"setup.xlsx":undefined,confirmedAccountRows:accounts});
  return {facility,user,grant,session,email,assetCode,departments,plant,add,workbook,preview,confirm};
}
test("SQL workbook: pure complete preview, six canonical commits, shared location, enrollment, leading zeros and repeat recovery",{skip},()=>run(async db=>{
  const f=await fixture(db),bytes=await f.workbook(),before={batches:await db.setupImportBatch.count({where:{facilityId:f.facility.id}}),users:await db.user.count({where:{email:f.email}}),places:await db.unitSpace.count({where:{facilityId:f.facility.id}})},p=await f.preview(bytes);
  assert.deepEqual(p.rows.map(r=>r.plan.action),["create","create","add","add","add","create"]);assert.deepEqual({batches:await db.setupImportBatch.count({where:{facilityId:f.facility.id}}),users:await db.user.count({where:{email:f.email}}),places:await db.unitSpace.count({where:{facilityId:f.facility.id}})},before);
  const result=await f.confirm(p,bytes);assert.deepEqual(result.rows.map(r=>r.status),Array(6).fill("committed"));const roomId=result.mapping["locations:room001"]!.locationId!,employeeId=result.mapping["workforce:p001"]!.employeeId!;
  assert.equal(await db.unitSpace.count({where:{facilityId:f.facility.id}}),1);assert.equal(await db.unitSpaceResponsibility.count({where:{spaceId:roomId}}),2);assert.equal((await db.unitSpace.findUniqueOrThrow({where:{id:roomId}})).roomNumber,"001");
  const person=await db.employee.findUniqueOrThrow({where:{id:employeeId},include:{user:true,employeeDepartments:true}});assert.equal(person.phone,"00123");assert.equal(person.user!.passwordHash,null);assert.equal(person.pinDigest,null);assert.equal(person.employeeDepartments.length,1);assert.match(result.rows[1]!.enrollment!.pin,/pending/);
  const asset=await db.asset.findFirstOrThrow({where:{unit:{facilityId:f.facility.id}}});assert.equal(asset.assetCode,f.assetCode);assert.equal(asset.spaceId,roomId);
  const again=await f.confirm(p);assert.deepEqual(again.rows.map(r=>r.status),result.rows.map(r=>r.status));assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK"}}),6);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);
}));
test("SQL workbook: stale preview/bytes, Facility and effective authority cannot mutate",{skip},()=>run(async db=>{
  const f=await fixture(db),bytes=await f.workbook(),p=await f.preview(bytes);await db.unit.create({data:{facilityId:f.facility.id,name:"External floor",unitType:"OTHER",hierarchyRole:"FLOOR"}});await assert.rejects(()=>f.confirm(p,bytes),/Material facts/);assert.equal(await db.setupImportBatch.count({where:{id:p.batchId}}),0);
  const changed=await f.workbook(w=>f.add(w,"People",{email:f.email,firstName:"Casey",lastName:"Worker",roleType:"STAFF",employmentType:"PART_TIME",primaryDepartment:"DIETARY",phone:"00999"}));await assert.rejects(()=>f.confirm(p,changed),/bytes changed/);
  const fresh=await f.preview(bytes);await db.user.update({where:{id:f.user.id},data:{sessionVersion:{increment:1}}});await assert.rejects(()=>f.confirm(fresh,bytes),/authority|session/i);
  await assert.rejects(()=>previewWorkbook(db,{...f.session,facilityId:"other"},bytes,"setup.xlsx",f.facility.id),/Facility/);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),0);
}));
test("SQL workbook: partial failure preserves committed mappings and retry does not duplicate earlier phases",{skip},()=>run(async db=>{
  const f=await fixture(db),bytes=await f.workbook(),p=await f.preview(bytes);let injected=false;
  const faulty=db.$extends({query:{employee:{async create({args,query}){if(args.data.email===f.email&&!injected){injected=true;throw Error("injected canonical identity failure");}return query(args);}}}}) as unknown as PrismaClient;
  await f.confirm(p,bytes,[],faulty);const partial=await workbookResults(db,f.session,p.batchId);assert.equal(partial.rows[0]!.status,"committed");assert.equal(partial.rows[1]!.status,"failed");assert.equal(partial.mapping["workforce:p001"],undefined);assert.ok(partial.mapping["locations:room001"]);
  const recovered=await f.confirm(p);assert.ok(recovered.rows.every(r=>["committed","reused"].includes(r.status)));assert.equal(await db.unitSpace.count({where:{facilityId:f.facility.id}}),1);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);
}));
test("SQL workbook: relevant external drift after an earlier commit requires renewed review; own checkpoints are not external drift",{skip},()=>run(async db=>{
  const f=await fixture(db),bytes=await f.workbook(),p=await f.preview(bytes);let failed=false;
  const faulty=db.$extends({query:{employee:{async create({args,query}){if(args.data.email===f.email&&!failed){failed=true;throw Error("temporary failure");}return query(args);}}}}) as unknown as PrismaClient;
  await f.confirm(p,bytes,[],faulty);const prior=await workbookResults(db,f.session,p.batchId);const roomId=prior.mapping["locations:room001"]!.locationId!;await db.unitSpace.update({where:{id:roomId},data:{name:"External room change"}});await assert.rejects(()=>f.confirm(p),/External material/);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),0);assert.equal((await workbookResults(db,f.session,p.batchId)).rows[0]!.status,"committed");
}));
test("SQL workbook: concurrent/repeated confirmation and lost child commit response recover one actual identity",{skip},()=>run(async db=>{
  const f=await fixture(db),bytes=await f.workbook(),p=await f.preview(bytes);let lost=false;const proxy=new Proxy(db,{get(target,key){if(key==="$transaction")return async(fn:Parameters<PrismaClient["$transaction"]>[0],options:unknown)=>{const result=await (target.$transaction as unknown as (fn:unknown,options:unknown)=>Promise<unknown>).call(target,fn,options);if(!lost&&await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK"}})){lost=true;throw Error("simulated lost committed child response");}return result;};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});
  await f.confirm(p,bytes,[],proxy);assert.equal(lost,true);
  const settled=await Promise.allSettled([f.confirm(p),f.confirm(p)]);assert.ok(settled.some(s=>s.status==="fulfilled"));const current=await workbookResults(db,f.session,p.batchId);if(current.rows.some(r=>r.status==="unknown"))await f.confirm(p);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);assert.equal(await db.unitSpace.count({where:{facilityId:f.facility.id}}),1);const recovered=await f.confirm(p);assert.ok(recovered.rows.every(r=>["committed","reused"].includes(r.status)));
}));
test("SQL workbook: existing account requires explicit consent, Console stays PlatformStaff, denied credentials and unknown references block",{skip},()=>run(async db=>{
  const f=await fixture(db),staff=await db.platformStaff.create({data:{email:`staff-${randomUUID()}@example.com`,displayName:"Workbook Staff",passwordHash:"unused",role:"OWNER"}}),s={...f.session,uid:staff.id,authKind:"harbor_staff",primaryDepartmentId:null,name:staff.displayName,email:staff.email} as FacilitySession;
  const bytes=await f.workbook(w=>f.add(w,"People",{rowRef:"admin",email:f.user.email})),p=await f.preview(bytes,s);assert.equal(p.rows[0]!.plan.requiresAccountConfirmation,f.user.id);const denied=await f.confirm(p,bytes,[],db,s);assert.equal(denied.rows[0]!.status,"unknown");const reused=await f.confirm(p,undefined,[p.rows[0]!.id],db,s);assert.equal(reused.rows[0]!.status,"reused");const parent=await db.setupImportBatch.findUniqueOrThrow({where:{id:p.batchId}});assert.equal(parent.actorUserId,null);assert.equal(parent.actorStaffId,staff.id);assert.equal(await db.user.count({where:{id:staff.id}}),0);assert.equal((await db.user.findUniqueOrThrow({where:{id:f.user.id}})).passwordHash,"existing-credential");
  await assert.rejects(()=>f.preview(bytes,{...f.session,authMethod:"QUICK_PIN"}),/password session/);await assert.rejects(()=>f.preview(bytes,{...f.session,role:"MANAGER"}),/Administrator/);
  const staffFull=await f.preview(await f.workbook(),s);assert.equal(staffFull.rows.at(-1)!.plan.action,"blocked");
  const missing=await f.workbook(w=>f.add(w,"Department Memberships",{employeeId:"ref:not-present",department:"PLANT",membership:"ADDITIONAL"}));const bad=await f.preview(missing);assert.equal(bad.rows[0]!.plan.action,"blocked");
}));

test("SQL workbook: canonical Facility Builder import racing workbook creation preserves one shared physical record",{skip},()=>run(async db=>{
  const f=await fixture(db),bytes=await f.workbook(),p=await f.preview(bytes),built=buildFacilityStructurePlanFromCsv('floor,neighborhood,locationName,locationType,roomNumber\nFloor 1,Shared Wing,Room 001,Resident Room,001\n',await loadFacilityStructureCatalog(db,f.facility.id),"locations.csv");assert.equal(built.ok,true);if(!built.ok)return;
  const races=await Promise.allSettled([f.confirm(p,bytes),executeFacilityStructurePlan(db,f.facility.id,built.plan)]);assert.ok(races.some(r=>r.status==="fulfilled"));assert.equal(await db.unitSpace.count({where:{facilityId:f.facility.id,name:"Room 001"}}),1);assert.equal(await db.unit.count({where:{facilityId:f.facility.id,hierarchyRole:"FLOOR"}}),1);
}));
test("SQL workbook: bounded 25-row execution resumes committed references across requests",{skip},()=>run(async db=>{
 const f=await fixture(db),bytes=await f.workbook(w=>{f.add(w,"Locations",{rowRef:"room001",floor:"Floor 1",neighborhood:"Wing",locationName:"Room 001",locationType:"Resident Room"});for(let i=1;i<=26;i++)f.add(w,"People",{rowRef:`p${i}`,email:`${i}-${f.email}`,firstName:"Casey",lastName:"Worker",roleType:"STAFF",employmentType:"PART_TIME",primaryDepartment:"DIETARY"});f.add(w,"Department Memberships",{employeeId:"ref:p26",department:"PLANT",membership:"ADDITIONAL"});}),p=await f.preview(bytes),first=await f.confirm(p,bytes);assert.equal(first.rows.filter(r=>["committed","failed"].includes(r.status)).length,25);assert.equal(first.rows.filter(r=>r.status==="unknown").length,3);assert.equal(Object.keys(first.mapping).length,first.rows.filter(r=>r.status==="committed").length);assert.equal(first.mapping["workforce:p26"],undefined);const second=await f.confirm(p);assert.equal(second.rows.filter(r=>r.status==="committed").length,28);assert.ok(second.mapping["workforce:p26"]);assert.equal(await db.employee.count({where:{facilityId:f.facility.id}}),27);
}));
test("SQL workbook: assisted review shares authorized canonical child receipts, never the unsupported aggregate",{skip},()=>run(async db=>{
 const f=await fixture(db),owner=await db.platformStaff.create({data:{email:`owner-${randomUUID()}@example.com`,displayName:"Service Owner",passwordHash:"unused",role:"OWNER"}}),service=await import("@/lib/implementation/service"),c={kind:"customer" as const,session:f.session},s={kind:"staff" as const,session:{uid:owner.id,email:owner.email,name:owner.displayName,staffRole:owner.role,sessionVersion:0,tokenUse:"harbor" as const},workFacilityId:null},scope={departmentKeys:["DIETARY","PLANT"],deliverables:["Review canonical workbook receipts"]};
 const id=await service.requestEngagement(db,c,f.facility.id,scope);await service.assignEngagement(db,s,id,owner.id);const order=await service.issueQuote(db,s,id,0,scope,"Owner-approved verification engagement");await service.approveQuote(db,c,id,order.id,order.digest);
 const bytes=await f.workbook(w=>f.add(w,"People",{rowRef:"p1",email:f.email,firstName:"Casey",lastName:"Worker",roleType:"STAFF",employmentType:"PART_TIME",primaryDepartment:"DIETARY"})),p=await f.preview(bytes),result=await f.confirm(p,bytes);await assert.rejects(()=>service.linkImport(db,c,id,p.batchId),/canonical dataset child/);await service.linkImport(db,c,id,result.rows[0]!.childBatchId!);const shared=await service.sharedResults(db,c,id);assert.equal(shared.length,1);assert.equal(shared[0]!.actorKind,"user");assert.equal(shared[0]!.actorId,f.user.id);assert.equal(shared[0]!.outcomes[0]!.status,"committed");
}));
test("SQL workbook: independently reviewed concurrent packages cannot auto-reuse a raced identity or duplicate a place",{skip},()=>run(async db=>{
 const f=await fixture(db),bytes=await f.workbook(),a=await f.preview(bytes),b=await f.preview(bytes),races=await Promise.allSettled([f.confirm(a,bytes),f.confirm(b,bytes)]);assert.ok(races.some(r=>r.status==="fulfilled"));assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);assert.equal(await db.unitSpace.count({where:{facilityId:f.facility.id}}),1);for(const p of [a,b]){const count=await db.setupImportBatch.count({where:{id:p.batchId}});if(count){const receipts=await workbookResults(db,f.session,p.batchId);if(!receipts.mapping["workforce:p001"])await assert.rejects(()=>f.confirm(p),/External material|Material facts/);}}
}));
test("SQL workbook: repeatedly failed early rows cannot starve unattempted work or its rollback recovery",{skip},()=>run(async db=>{
 const f=await fixture(db),bytes=await f.workbook(w=>{for(let i=1;i<=26;i++)f.add(w,"People",{rowRef:`p${i}`,email:`${i===26?"success":"fail"}-${i}-${f.email}`,firstName:"Casey",lastName:"Worker",roleType:"STAFF",employmentType:"PART_TIME",primaryDepartment:"DIETARY"});}),p=await f.preview(bytes);
 let rollbackAttempts=0;
 const faulty=db.$extends({query:{employee:{async create({args,query}){
   if(String(args.data.email).startsWith("fail-"))throw Error("repeatable row-local failure");
   // Exhaust the existing five transaction attempts once. A row attempt is not
   // a promised commit; a later request must recover the SAME reviewed child.
   if(rollbackAttempts++<5)throw new Prisma.PrismaClientKnownRequestError("injected serialization rollback",{code:"P2034",clientVersion:Prisma.prismaVersion.client});
   return query(args);
 }}}}) as unknown as PrismaClient;
 const counters=async()=>((await db.setupImportBatch.findUniqueOrThrow({where:{id:p.batchId}})).reviewedPlan as unknown as {attemptCounts:Record<string,number>}).attemptCounts;
 const total=(counts:Record<string,number>)=>Object.values(counts).reduce((a,b)=>a+b,0);
 const first=await f.confirm(p,bytes,[],faulty);
 assert.equal(first.rows.filter(r=>r.status==="failed").length,25);assert.equal(first.rows[25]!.status,"unknown");assert.equal(total(await counters()),25);
 const second=await f.confirm(p,undefined,[],faulty),childId=second.rows[25]!.childBatchId!;
 assert.equal(second.rows[25]!.status,"failed");assert.equal(rollbackAttempts,5);assert.equal(second.mapping["workforce:p26"],undefined);assert.equal(total(await counters()),50);
 assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:{startsWith:"success-"}}}),0);
 assert.equal(await db.setupImportResult.count({where:{batchId:childId,phase:"IMPORT",status:"failed"}}),1);
 const third=await f.confirm(p,undefined,[],faulty);
 assert.equal(third.rows[25]!.status,"committed");assert.equal(third.rows[25]!.childBatchId,childId);assert.ok(third.mapping["workforce:p26"]);assert.equal(total(await counters()),75);
 assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:{startsWith:"success-"}}}),1);
 assert.equal(await db.setupImportResult.count({where:{batchId:childId,phase:"IMPORT",status:"committed"}}),1);
 assert.equal(await db.setupImportResult.count({where:{batchId:childId,phase:"IMPORT",status:"failed"}}),1);
}));
test("SQL workbook: own shared-parent location commits permit safe child refresh while failed receipt history survives",{skip},()=>run(async db=>{
 const f=await fixture(db),bytes=await f.workbook(w=>{for(const name of ["Room A","Room B"])f.add(w,"Locations",{rowRef:name,floor:"Floor 1",neighborhood:"Shared Wing",locationName:name,locationType:"Resident Room"});}),p=await f.preview(bytes);let fail=true;
 const faulty=db.$extends({query:{unitSpace:{async create({args,query}){if(args.data.name==="Room A"&&fail){fail=false;throw Error("injected row failure");}return query(args);}}}}) as unknown as PrismaClient;
 const first=await f.confirm(p,bytes,[],faulty);assert.deepEqual(first.rows.map(r=>r.status),["failed","committed"]);const second=await f.confirm(p);assert.deepEqual(second.rows.map(r=>r.status),["committed","committed"]);assert.deepEqual(second.rows[0]!.attempts.map(a=>a.status),["failed","committed"]);assert.equal(await db.unit.count({where:{facilityId:f.facility.id,hierarchyRole:"FLOOR"}}),1);assert.equal(await db.unitSpace.count({where:{facilityId:f.facility.id}}),2);assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK_REVIEW"}}),1);
}));
test("SQL workbook: Asset default responsibility is an explicit cross-sheet dependency and waits for its successful receipt",{skip},()=>run(async db=>{
 const f=await fixture(db),bytes=await f.workbook(w=>{f.add(w,"Locations",{rowRef:"wing",floor:"Floor 1",neighborhood:"Shared Wing"});f.add(w,"Department Locations",{rowRef:"resp",department:"PLANT",locationType:"UNIT",locationId:"ref:wing",kind:"PRIMARY"});f.add(w,"Assets",{name:"Cold cabinet",equipmentType:"Refrigerator",assetCode:f.assetCode,floor:"ref:wing",neighborhood:"ref:wing"});}),p=await f.preview(bytes);assert.ok(p.rows[2]!.dependencies.includes("department_locations:resp"));let fail=true;
 const faulty=db.$extends({query:{unitDepartmentResponsibility:{async upsert({args,query}){if(fail){fail=false;throw Error("temporary responsibility failure");}return query(args);}}}}) as unknown as PrismaClient;
 const first=await f.confirm(p,bytes,[],faulty);assert.deepEqual(first.rows.map(r=>r.status),["committed","failed","unknown"]);const second=await f.confirm(p);assert.ok(second.rows.every(r=>r.status==="committed"));assert.equal((await db.asset.findUniqueOrThrow({where:{assetCode:f.assetCode}})).departmentId,f.plant.id);
}));

test("SQL workbook: concurrent independent Facilities retain one canonical identity and receipt each",{skip},()=>run(async db=>{
  const cases=[];
  for(let i=0;i<4;i++){
    const f=await fixture(db),bytes=await f.workbook(w=>f.add(w,"People",{rowRef:"person",email:f.email,firstName:"Concurrent",lastName:"Worker",roleType:"STAFF",employmentType:"PART_TIME",primaryDepartment:"DIETARY"}));
    cases.push({f,bytes,preview:await f.preview(bytes)});
  }
  const results=await Promise.all(cases.map(c=>c.f.confirm(c.preview,c.bytes)));
  for(let i=0;i<cases.length;i++){
    const c=cases[i]!;assert.equal(results[i]!.rows[0]!.status,"committed");
    await c.f.confirm(c.preview);
    assert.equal(await db.employee.count({where:{facilityId:c.f.facility.id,email:c.f.email}}),1);
    assert.equal(await db.setupImportResult.count({where:{batchId:c.preview.batchId,phase:"WORKBOOK",status:"committed"}}),1);
  }
}));

test("SQL workbook: exhausted child-claim SSI is a failed attempt, preserves 25-row progress and resumes the same references",{skip},()=>run(async db=>{
  const f=await fixture(db),bytes=await f.workbook(w=>{
    f.add(w,"Locations",{rowRef:"room001",floor:"Floor 1",neighborhood:"Wing",locationName:"Room 001",locationType:"Resident Room"});
    for(let i=1;i<=26;i++)f.add(w,"People",{rowRef:`p${i}`,email:`${i}-${f.email}`,firstName:"Casey",lastName:"Worker",roleType:"STAFF",employmentType:"PART_TIME",primaryDepartment:"DIETARY"});
    f.add(w,"Department Memberships",{employeeId:"ref:p26",department:"PLANT",membership:"ADDITIONAL"});
  }),p=await f.preview(bytes);
  // Two independent, non-source Users produce an actual PostgreSQL SSI cycle:
  // victim reads A; rival reads B/writes A/commits; victim writes B and rolls back.
  const sentinels=await Promise.all(["a","b"].map(name=>db.user.create({data:{email:`ssi-${name}-${randomUUID()}@example.com`,displayName:"SSI probe",facilityId:f.facility.id,roleId:f.user.roleId}})));
  let rollbacks=0;const observed:Array<{code:unknown;sqlState:unknown}>=[];
  const faulty=new Proxy(db,{get(target,key){
    if(key==="$transaction")return (work:(tx:unknown)=>Promise<unknown>,options:unknown)=>(target.$transaction as unknown as (work:(tx:Prisma.TransactionClient)=>Promise<unknown>,options:unknown)=>Promise<unknown>).call(target,async(tx:Prisma.TransactionClient)=>work(new Proxy(tx,{get(t,k){
      if(k==="setupImportBatch")return new Proxy(t.setupImportBatch,{get(delegate,method){
        if(method==="create")return async(args:Prisma.SetupImportBatchCreateArgs)=>{
          const source=args.data.reviewedPlan as unknown as {source?:{rows?:Array<{values:{email?:string}}>}};
          if(args.data.dataset==="workforce"&&source.source?.rows?.[0]?.values.email===`1-${f.email}`&&rollbacks<5){
            rollbacks++;
            await tx.user.findUniqueOrThrow({where:{id:sentinels[0]!.id},select:{updatedAt:true}});
            await db.$transaction(async rival=>{
              await rival.user.findUniqueOrThrow({where:{id:sentinels[1]!.id},select:{updatedAt:true}});
              await rival.user.update({where:{id:sentinels[0]!.id},data:{updatedAt:new Date()}});
            },{isolationLevel:"Serializable"});
            try{await tx.user.update({where:{id:sentinels[1]!.id},data:{updatedAt:new Date()}});}catch(error){
              const e=error as {code?:unknown;meta?:{code?:unknown}};observed.push({code:e.code,sqlState:e.meta?.code});throw error;
            }
          }
          return delegate.create(args);
        };
        const value=Reflect.get(delegate,method);return typeof value==="function"?value.bind(delegate):value;
      }});
      const value=Reflect.get(t,k);return typeof value==="function"?value.bind(t):value;
    }})),options);
    const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
  }}) as PrismaClient;
  const first=await f.confirm(p,bytes,[],faulty);
  assert.equal(rollbacks,5);assert.equal(observed.length,5);assert.ok(observed.every(e=>e.code==="P2034"||(e.code==="P2010"&&e.sqlState==="40001")));
  assert.equal(first.rows.filter(r=>["committed","failed"].includes(r.status)).length,25);
  assert.equal(first.rows.filter(r=>r.status==="committed").length,24);assert.equal(first.rows[1]!.status,"failed");assert.equal(first.rows.filter(r=>r.status==="unknown").length,3);
  assert.equal(Object.keys(first.mapping).length,24);assert.equal(first.mapping["workforce:p1"],undefined);assert.equal(first.mapping["workforce:p26"],undefined);
  const childId=first.rows[1]!.childBatchId!;assert.ok(childId);assert.equal(await db.setupImportBatch.count({where:{id:childId}}),0);
  assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:`1-${f.email}`}}),0);
  const next=await f.confirm(p);assert.ok(next.rows.every(r=>r.status==="committed"));assert.equal(next.rows[1]!.childBatchId,childId);
  assert.deepEqual(next.rows[1]!.attempts.map(a=>a.status),["failed","committed"]);
  assert.equal(Object.keys(next.mapping).length,28);assert.equal(await db.employee.count({where:{facilityId:f.facility.id}}),27);
  assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK"}}),28);
  assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK_ATTEMPT",status:"failed"}}),1);
  await f.confirm(p);assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK"}}),28);
}));

test("SQL workbook: unknown child-claim COMMIT stops, reconciles its lease and resumes the original identity",{skip},()=>run(async db=>{
  const f=await fixture(db),bytes=await f.workbook(),p=await f.preview(bytes);let lost=false;
  const uncertain=new Proxy(db,{get(target,key){
    if(key==="$transaction")return async(work:unknown,options:unknown)=>{
      const result=await (target.$transaction as unknown as (work:unknown,options:unknown)=>Promise<unknown>).call(target,work,options);
      if(!lost){const child=await db.setupImportBatch.findFirst({where:{facilityId:f.facility.id,dataset:"workforce",leaseToken:{not:null}}});if(child){lost=true;throw Error("lost child claim COMMIT response");}}
      return result;
    };
    const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
  }}) as PrismaClient;
  const partial=await f.confirm(p,bytes,[],uncertain);assert.equal(lost,true);assert.equal(partial.running,true);
  assert.deepEqual(partial.rows.map(r=>r.status),["committed","unknown","unknown","unknown","unknown","unknown"]);
  assert.equal(Object.keys(partial.mapping).length,1);assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),0);
  assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK_ATTEMPT",status:"failed"}}),0);
  const childId=partial.rows[1]!.childBatchId!;assert.ok(childId);const during=await f.confirm(p);assert.equal(during.running,true);assert.equal(during.rows[1]!.status,"unknown");
  assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),0);
  // Simulate the abandoned request's lease expiring, without deleting its claim.
  await db.setupImportBatch.update({where:{id:childId},data:{leaseExpiresAt:new Date(0)}});
  const result=await f.confirm(p);assert.ok(result.rows.every(r=>r.status==="committed"));assert.equal(result.rows[1]!.childBatchId,childId);
  assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),1);
  assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK"}}),6);
}));

test("SQL workbook: coordination-only child claim cannot authorize effects after external workbook drift",{skip},()=>run(async db=>{
  const f=await fixture(db),bytes=await f.workbook(),p=await f.preview(bytes);let changed=false,childId="";
  const raced=new Proxy(db,{get(target,key){
    if(key==="$transaction")return async(work:unknown,options:unknown)=>{
      const result=await (target.$transaction as unknown as (work:unknown,options:unknown)=>Promise<unknown>).call(target,work,options);
      if(!changed){const child=await db.setupImportBatch.findFirst({where:{facilityId:f.facility.id,dataset:"workforce",leaseToken:{not:null}}});if(child){
        changed=true;childId=child.id;const room=await db.unitSpace.findFirstOrThrow({where:{facilityId:f.facility.id}});await db.unitSpace.update({where:{id:room.id},data:{name:"Externally changed after claim"}});
      }}return result;
    };
    const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
  }}) as PrismaClient;
  await assert.rejects(()=>f.confirm(p,bytes,[],raced),/External material/);assert.equal(changed,true);
  const result=await workbookResults(db,f.session,p.batchId);assert.equal(result.rows[0]!.status,"committed");assert.equal(result.rows[1]!.status,"blocked");
  assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}}),0);
  assert.equal(await db.setupImportResult.count({where:{batchId:childId,phase:"IMPORT",status:"blocked"}}),1);
  assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK"}}),1);
}));

// Sign only isolated test reviews to exercise the pre-versioned compatibility path.
function signTestReview(review:Record<string,unknown>){const body=Buffer.from(JSON.stringify(review)).toString("base64url");return `${body}.${createHmac("sha256",process.env.AUTH_SECRET!).update(`workbook/1:${body}`).digest("base64url")}`;}
test("SQL workbook: scoped checkpoints retire unused completed People; legacy reviews retain full protection",{skip},()=>run(async db=>{
 for(const legacy of [false,true]){
  const f=await fixture(db),bytes=await f.workbook(w=>{for(const rowRef of ["done","pending"])f.add(w,"People",{rowRef,email:`${rowRef}-${f.email}`,firstName:"Casey",lastName:"Worker",roleType:"STAFF",employmentType:"PART_TIME",primaryDepartment:"DIETARY"});}),p=await f.preview(bytes);
  if(legacy){const review=JSON.parse(Buffer.from(p.reviewToken.split(".")[0]!,"base64url").toString());delete review.checkpointVersion;const source=readWorkbook(bytes,"setup.xlsx",f.facility.id),catalog=await workbookCatalog(db,f.session,source);review.digest=hash({source,rows:planWorkbook(source,catalog),checkpoint:checkpoint(catalog)});p.reviewToken=signTestReview(review);}
  const faulty=db.$extends({query:{employee:{async create({args,query}){if(args.data.email===`pending-${f.email}`)throw Error("pending row fixture failure");return query(args);}}}}) as unknown as PrismaClient;
  const first=await f.confirm(p,bytes,[],faulty);assert.deepEqual(first.rows.map(r=>r.status),["committed","failed"]);
  const target=first.mapping["workforce:done"]!;await db.user.update({where:{id:target.userId},data:{isActive:false,sessionVersion:{increment:1}}});
  const second=await f.confirm(p);assert.deepEqual(second.rows.map(r=>r.status),legacy?["committed","blocked"]:["committed","committed"]);
  assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:`pending-${f.email}`}}),legacy?0:1);
  assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK"}}),legacy?1:2);
  assert.equal(second.mapping["workforce:done"]!.employeeId,target.employeeId);assert.equal((await db.user.findUniqueOrThrow({where:{id:target.userId}})).isActive,false);
  const stored=(await db.setupImportBatch.findUniqueOrThrow({where:{id:p.batchId}})).reviewedPlan as Record<string,unknown>;assert.equal(stored.checkpointVersion,legacy?undefined:2);
 }
}));
test("SQL workbook: pending relationship retains completed person's lifecycle and credential facts",{skip},()=>run(async db=>{
 for(const drift of ["revocation","credential"]){
  const f=await fixture(db),bytes=await f.workbook(w=>{f.add(w,"People",{rowRef:"p1",email:f.email,firstName:"Casey",lastName:"Worker",roleType:"STAFF",employmentType:"PART_TIME",primaryDepartment:"DIETARY"});f.add(w,"Department Memberships",{rowRef:"m1",employeeId:"ref:p1",department:"PLANT",membership:"ADDITIONAL"});}),p=await f.preview(bytes);
  const faulty=db.$extends({query:{employeeDepartment:{async createMany(){throw Error("pending relationship fixture failure");}}}}) as unknown as PrismaClient;
  const first=await f.confirm(p,bytes,[],faulty);assert.deepEqual(first.rows.map(r=>r.status),["committed","failed"]);const target=first.mapping["workforce:p1"]!;
  if(drift==="revocation")await db.userFacilityAccess.updateMany({where:{userId:target.userId,facilityId:f.facility.id},data:{isActive:false,revokedAt:new Date()}});
  else await db.user.update({where:{id:target.userId},data:{passwordHash:"newly-enrolled-credential",emailVerifiedAt:new Date()}});
  const second=await f.confirm(p);assert.equal(second.rows[1]!.status,"blocked");assert.equal(await db.employeeDepartment.count({where:{employeeId:target.employeeId,departmentId:f.plant.id}}),0);assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK"}}),1);assert.deepEqual(second.mapping,first.mapping);
 }
}));
test("SQL workbook: scoped retirement keeps pending account consent and live actor checks; version cannot downgrade",{skip},()=>run(async db=>{
 const f=await fixture(db),bytes=await f.workbook(w=>{for(const rowRef of ["done","pending"])f.add(w,"People",{rowRef,email:`${rowRef}-${f.email}`,firstName:"Casey",lastName:"Worker",roleType:"STAFF",employmentType:"PART_TIME",primaryDepartment:"DIETARY"});}),p=await f.preview(bytes);
 const faulty=db.$extends({query:{employee:{async create({args,query}){if(args.data.email===`pending-${f.email}`)throw Error("pending row fixture failure");return query(args);}}}}) as unknown as PrismaClient;
 const first=await f.confirm(p,bytes,[],faulty);assert.deepEqual(first.rows.map(r=>r.status),["committed","failed"]);
 await db.user.create({data:{email:`pending-${f.email}`,displayName:"External account",facilityId:f.facility.id,roleId:f.user.roleId}});
 const second=await f.confirm(p);assert.equal(second.rows[1]!.status,"blocked");assert.equal(await db.employee.count({where:{facilityId:f.facility.id,email:`pending-${f.email}`}}),0);assert.deepEqual(second.mapping,first.mapping);
 const review=JSON.parse(Buffer.from(p.reviewToken.split(".")[0]!,"base64url").toString());delete review.checkpointVersion;
 await assert.rejects(()=>f.confirm({...p,reviewToken:signTestReview(review)}),/review does not match/);
 await assert.rejects(()=>f.confirm({...p,reviewToken:signTestReview({...review,checkpointVersion:3})}),/Invalid workbook review/);
 await db.user.update({where:{id:f.user.id},data:{sessionVersion:{increment:1}}});await assert.rejects(()=>f.confirm(p),/authority|session/i);
}));

test("SQL workbook: pending literal Employee ID retains full completed account facts",{skip},()=>run(async db=>{
 const f=await fixture(db),employee=await db.employee.findFirstOrThrow({where:{facilityId:f.facility.id,userId:f.user.id}}),bytes=await f.workbook(w=>{f.add(w,"People",{rowRef:"existing",email:f.user.email});f.add(w,"Department Memberships",{rowRef:"literal",employeeId:employee.id,department:"DIETARY",membership:"ADDITIONAL"});}),p=await f.preview(bytes);
 const faulty=db.$extends({query:{employeeDepartment:{async createMany(){throw Error("pending literal relationship fixture failure");}}}}) as unknown as PrismaClient;
 const first=await f.confirm(p,bytes,[p.rows[0]!.id],faulty);assert.deepEqual(first.rows.map(r=>r.status),["reused","failed"]);
 // displayName is a full account fact, beyond the relationship planner's User projection.
 await db.user.update({where:{id:f.user.id},data:{displayName:"Externally changed account"}});
 const second=await f.confirm(p);assert.equal(second.rows[1]!.status,"blocked");assert.deepEqual(second.mapping,first.mapping);assert.equal(await db.employeeDepartment.count({where:{employeeId:employee.id}}),0);assert.equal(await db.setupImportResult.count({where:{batchId:p.batchId,phase:"WORKBOOK"}}),1);
}));
