import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient, RoleKey } from "@prisma/client";
import { SignJWT } from "jose";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";
import { applyFacilitySubscription } from "../../src/lib/billing/apply-stripe-event";
import { deliverImportActivation } from "../../src/lib/setup-imports/activation";
import type { FacilitySession } from "../../src/lib/auth";
const url=process.env.ONBOARDING_TEST_DATABASE_URL;
if(url)assertDisposableDatabaseUrl(url);
test.skip(!url,"Requires an explicitly migrated isolated database and production build.");
const db=new PrismaClient({datasources:{db:{url}}});
const baseURL=process.env.ONBOARDING_BROWSER_BASE_URL||"http://127.0.0.1:55475";
test.afterAll(async()=>db.$disconnect());
async function sign(session: Record<string,unknown>){return new SignJWT(session).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));}
async function fixture(roleKey:RoleKey="FACILITY_ADMINISTRATOR"){
  const id=randomUUID();for(const key of Object.values(RoleKey))await db.role.upsert({where:{key},create:{key,name:key},update:{}});
  const role=await db.role.findUniqueOrThrow({where:{key:roleKey}});
  const org=await db.organization.create({data:{name:`ONB04 browser ${id}`,organizationType:"LONG_TERM_CARE"}});
  const facility=await db.facility.create({data:{displayName:"Shared Department Setup",organizationId:org.id,timezone:"America/New_York"}});
  await applyFacilitySubscription({facilityId:facility.id,status:"ACTIVE",departmentKeys:["DIETARY","PLANT"]},db);
  const departments=await db.department.findMany({where:{facilityId:facility.id}}),plant=departments.find(d=>d.key==="PLANT")!,dietary=departments.find(d=>d.key==="DIETARY")!;
  const user=await db.user.create({data:{facilityId:facility.id,primaryDepartmentId:plant.id,roleId:role.id,email:`admin-${id}@example.com`,displayName:"Import Administrator",passwordHash:"unused-cookie-fixture",emailVerifiedAt:new Date()}});
  await db.userFacilityAccess.create({data:{facilityId:facility.id,userId:user.id,rolePeriods:{create:{roleKey,startsAt:new Date("2020-01-01")}}}});
  await db.employee.create({data:{facilityId:facility.id,userId:user.id,email:user.email,firstName:"Import",lastName:"Administrator",roleType:roleKey,employmentType:"FULL_TIME",primaryDepartmentId:plant.id}});
  const floor=await db.unit.create({data:{facilityId:facility.id,name:"Floor 1",unitType:"OTHER",hierarchyRole:"FLOOR"}});
  const unit=await db.unit.create({data:{facilityId:facility.id,name:"Shared Wing",unitType:"OTHER",hierarchyRole:"NEIGHBORHOOD",parentUnitId:floor.id}});
  const room=await db.unitSpace.create({data:{facilityId:facility.id,unitId:unit.id,name:"Shared Room",spaceType:"SERVICE_AREA"}});
  const session={uid:user.id,authKind:"user",authMethod:"PASSWORD",scopeKind:"facility",role:roleKey,facilityId:facility.id,primaryDepartmentId:plant.id,name:user.displayName,email:user.email,sessionVersion:0} as FacilitySession;
  const email=`casey-${id}@example.com`,csv=`email,firstName,lastName,roleType,employmentType,primaryDepartment\n${email},Casey,Worker,STAFF,PART_TIME,DIETARY\n`;
  return {facility,user,plant,dietary,unit,room,session,token:await sign(session),email,csv};
}
async function login(context:BrowserContext,token:string){await context.addCookies([{name:"ltc_session",value:token,url:baseURL,httpOnly:true,sameSite:"Lax"}]);}
async function upload(page:Page,dataset:string,csv:string){
  await page.getByLabel("CSV dataset").selectOption(dataset);
  await page.getByLabel("CSV file",{exact:true}).setInputFiles({name:`${dataset}.csv`,mimeType:"text/csv",buffer:Buffer.from(dataset === "workforce" ? "\ufeff"+csv : csv)});
  await page.getByRole("button",{name:"Preview CSV — no mutations"}).click();
  await expect(page.getByRole("heading",{name:/^Review /})).toBeVisible();
}
async function confirm(page:Page){await page.getByRole("button",{name:"Confirm reviewed import (up to 25 rows)",exact:true}).click();await expect(page.getByTestId("setup-import-results")).toBeVisible();}
const results=(page:Page)=>page.getByTestId("setup-import-results");
for(const width of [1280,768])test(`CSV workforce, two Department memberships/shared Room and Assets at ${width}px`,async({page,context})=>{
  const f=await fixture();await login(context,f.token);await page.setViewportSize({width,height:1024});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/employees/bulk-setup");await expect(page.getByTestId("bulk-setup-page")).toBeVisible();
  const before=await db.setupImportBatch.count({where:{facilityId:f.facility.id}});
  await upload(page,"workforce",f.csv);
  expect(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}})).toBe(0);expect(await db.setupImportBatch.count({where:{facilityId:f.facility.id}})).toBe(before);
  await mkdir("tmp/onb04-browser",{recursive:true});await page.screenshot({path:`tmp/onb04-browser/preview-${width}.png`,fullPage:true});
  await confirm(page);await expect(results(page).getByLabel("Outcome counts")).toContainText("committed: 1");await expect(results(page)).toContainText("activation_pending");await expect(results(page)).toContainText("PIN: pending");
  const employee=await db.employee.findFirstOrThrow({where:{facilityId:f.facility.id,email:f.email}});expect(employee.pinDigest).toBeNull();
  expect((await db.setupImportBatch.findFirstOrThrow({where:{facilityId:f.facility.id}})).sourceHash).toBe(createHash("sha256").update(Buffer.from("\ufeff"+f.csv)).digest("hex"));
  await results(page).getByRole("button",{name:"Send / retry activation for row 2",exact:true}).click();await expect(results(page)).toContainText("Activation delivery: not_configured");
  await upload(page,"employee_departments",`employeeId,department,membership\n${employee.id},PLANT,ADDITIONAL\n`);
  await confirm(page);await expect(results(page).getByLabel("Outcome counts")).toContainText("committed: 1");
  await upload(page,"department_locations",`department,locationType,locationId,kind\nDIETARY,ROOM,${f.room.id},\nPLANT,ROOM,${f.room.id},\nPLANT,UNIT,${f.unit.id},PRIMARY\n`);await confirm(page);await expect(results(page).getByLabel("Outcome counts")).toContainText("committed: 3");
  const code=`BR-${randomUUID()}`;
  await upload(page,"assets",`name,equipmentType,floor,neighborhood,space,assetCode\nShared cooler,Fridge,Floor 1,Shared Wing,Shared Room,${code}\n`);await confirm(page);await expect(results(page).getByLabel("Outcome counts")).toContainText("committed: 1");
  const asset=await db.asset.findUniqueOrThrow({where:{assetCode:code}});expect(asset.departmentId).toBe(f.plant.id);expect(asset.spaceId).toBe(f.room.id);
  expect(await db.unitSpace.count({where:{id:f.room.id}})).toBe(1);expect(await db.unitSpaceResponsibility.count({where:{spaceId:f.room.id}})).toBe(2);expect(await db.employee.count({where:{facilityId:f.facility.id,userId:employee.userId}})).toBe(1);
  const e=await db.employee.findUniqueOrThrow({where:{id:employee.id},include:{employeeDepartments:true}});expect(new Set([e.primaryDepartmentId,...e.employeeDepartments.map(x=>x.departmentId)]).size).toBe(2);
  await page.screenshot({path:`tmp/onb04-browser/results-${width}.png`,fullPage:true});
  await page.goto("/assets/builder");await page.getByTestId("asset-bulk-import-open").click();await expect(page.getByRole("dialog",{name:"Import equipment"})).toBeVisible();await expect(page.getByLabel("CSV dataset")).toHaveValue("assets");
  await upload(page,"assets",`name,equipmentType,floor,neighborhood,space,assetCode\nShared cooler,Fridge,Floor 1,Shared Wing,Shared Room,${code}\n`);await confirm(page);await expect(results(page).getByLabel("Outcome counts")).toContainText("reused: 1");
  expect(await db.asset.count({where:{assetCode:code}})).toBe(1);expect(errors).toEqual([]);
});

test("existing global account requires explicit preview consent; reused credentials are preserved",async({page,context})=>{
  const f=await fixture(),role=await db.role.findUniqueOrThrow({where:{key:"STAFF"}});
  const user=await db.user.create({data:{email:f.email,displayName:"Existing Casey",facilityId:f.facility.id,roleId:role.id,passwordHash:"preserve-this-hash",emailVerifiedAt:new Date()}});
  await login(context,f.token);await page.goto("/employees/bulk-setup");await upload(page,"workforce",f.csv);
  const button=page.getByRole("button",{name:"Confirm reviewed import (up to 25 rows)",exact:true});await expect(button).toBeDisabled();await page.getByRole("checkbox",{name:/I confirm the existing account/}).check();await confirm(page);
  expect((await db.employee.findFirstOrThrow({where:{facilityId:f.facility.id,email:f.email}})).userId).toBe(user.id);expect((await db.user.findUniqueOrThrow({where:{id:user.id}})).passwordHash).toBe("preserve-this-hash");
  await upload(page,"workforce",`email\n${f.email}\n`);await page.getByRole("checkbox",{name:/I confirm the existing account/}).check();await confirm(page);await expect(results(page).getByLabel("Outcome counts")).toContainText("reused: 1");
});

test("lost response is unknown, saved batch reconciles after reload before any replay",async({page,context})=>{
  const f=await fixture();await login(context,f.token);await page.goto("/employees/bulk-setup");await upload(page,"workforce",f.csv);
  let dropped=false;await page.route("**/employees/bulk-setup",async route=>{
    const request=route.request();if(!dropped && request.method()==="POST" && request.postData()?.includes("reviewToken")){dropped=true;await route.fetch();await route.abort("failed");}else await route.continue();
  });
  await page.getByRole("button",{name:"Confirm reviewed import (up to 25 rows)",exact:true}).click();await expect(page.getByText("Outcome unknown.",{exact:false})).toBeVisible();
  expect(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}})).toBe(1);await page.unroute("**/employees/bulk-setup");await page.reload();
  await page.getByRole("button",{name:"Recover saved batch"}).click();await expect(results(page).getByLabel("Outcome counts")).toContainText("committed: 1");
  await page.getByRole("button",{name:"Continue / retry remaining reviewed rows (up to 25)"}).click();await expect(results(page).getByLabel("Outcome counts")).toContainText("committed: 1");
  expect(await db.employee.count({where:{facilityId:f.facility.id,email:f.email}})).toBe(1);expect(await db.setupImportResult.count({where:{batch:{facilityId:f.facility.id},phase:"IMPORT"}})).toBe(1);
});

test("material changes block confirmation, fresh preview recovers mixed committed/blocked rows, Facility switch isolates hints",async({page,context})=>{
  const f=await fixture();await login(context,f.token);await page.goto("/employees/bulk-setup");await upload(page,"workforce",f.csv);
  await db.department.update({where:{id:f.dietary.id},data:{isActive:false}});await page.getByRole("button",{name:"Confirm reviewed import (up to 25 rows)",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"Material facts changed"})).toBeVisible();expect(await db.user.count({where:{email:f.email}})).toBe(0);
  await db.department.update({where:{id:f.dietary.id},data:{isActive:true}});await page.getByRole("button",{name:"Back to file / fresh preview"}).click();
  await upload(page,"workforce",f.csv+`bad-${f.email},Bad,Reference,STAFF,PART_TIME,UNKNOWN_PRODUCT\n`);await confirm(page);await expect(results(page).getByLabel("Outcome counts")).toContainText("committed: 1");await expect(results(page).getByLabel("Outcome counts")).toContainText("blocked: 1");
  const other=await fixture();await login(context,other.token);await page.goto("/employees/bulk-setup");await expect(page.getByRole("button",{name:"Recover saved batch"})).toHaveCount(0);expect(await db.employee.count({where:{facilityId:other.facility.id,email:f.email}})).toBe(0);
});

test("new account accepts canonical activation then customer People enrolls PIN without credential bypass",async({page,context,browser})=>{
  const f=await fixture();await login(context,f.token);await page.goto("/employees/bulk-setup");await upload(page,"workforce",f.csv);await confirm(page);
  const batch=await db.setupImportBatch.findFirstOrThrow({where:{facilityId:f.facility.id},orderBy:{createdAt:"desc"}});let invitation="";
  await deliverImportActivation(db,f.session,{batchId:batch.id,row:2,origin:baseURL},{configured:()=>true,send:async args=>{invitation=args.inviteUrl;return {sent:true,messageId:"captured-local"};}});
  const recipient=await browser.newContext({baseURL}),accept=await recipient.newPage();await accept.goto("/login");
  const before=await accept.evaluate(async email=>{const r=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password:"Onb04-Test-Password!"})});return r.status;},f.email);expect(before).toBe(403);
  await recipient.addCookies([{name:"ltc_device_facility",value:f.facility.id,url:baseURL,httpOnly:true,sameSite:"Lax"}]);
  const beforePin=await accept.evaluate(async()=>{const r=await fetch("/api/auth/pin-login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pin:"582604"})});return r.status;});expect(beforePin).toBe(401);
  await accept.goto(invitation);await accept.getByLabel("Password",{exact:true}).fill("Onb04-Test-Password!");await accept.getByLabel("Confirm password",{exact:true}).fill("Onb04-Test-Password!");await accept.getByRole("button",{name:"Create password and continue"}).click();
  await expect.poll(async()=>Boolean((await db.user.findUniqueOrThrow({where:{email:f.email}})).passwordHash)).toBe(true);
  const employee=await db.employee.findFirstOrThrow({where:{facilityId:f.facility.id,email:f.email}});expect(employee.pinDigest).toBeNull();
  expect((await db.setupImportBatch.findFirstOrThrow({where:{facilityId:f.facility.id}})).sourceHash).toBe(createHash("sha256").update(Buffer.from("\ufeff"+f.csv)).digest("hex"));
  await page.goto("/employees");const card=page.locator(`#employee-${employee.id}`);await card.getByRole("button",{name:/Casey Worker/}).click();await card.getByRole("button",{name:"Set PIN",exact:true}).click();await card.getByLabel("New PIN (6 digits)",{exact:true}).fill("582604");await card.getByLabel("Confirm PIN",{exact:true}).fill("582604");await card.getByRole("button",{name:"Save PIN",exact:true}).click();await expect(card.getByText("PIN configured",{exact:true})).toBeVisible();
  expect((await db.employee.findUniqueOrThrow({where:{id:employee.id}})).pinDigest).not.toBeNull();
  const afterPin=await accept.evaluate(async()=>{const r=await fetch("/api/auth/pin-login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pin:"582604"})});return r.status;});expect(afterPin).toBe(200);
  await recipient.close();
});

test("Console opens real Facility work and retains PlatformStaff attribution; denied customer role has no workforce intake",async({page,context,browser})=>{
  const f=await fixture(),id=randomUUID(),staff=await db.platformStaff.create({data:{email:`staff-${id}@example.com`,displayName:"Import Support",passwordHash:"unused-local",role:"OWNER"}});
  const token=await sign({uid:staff.id,tokenUse:"harbor",email:staff.email,name:staff.displayName,staffRole:"OWNER",sessionVersion:0});await context.addCookies([{name:"harbor_session",value:token,url:baseURL,httpOnly:true,sameSite:"Lax"}]);
  await page.goto(`/console/customers/${f.facility.id}`);await page.getByTestId("harbor-open-facility").click();await page.goto("/employees/bulk-setup");await upload(page,"workforce",f.csv);await confirm(page);await expect(results(page).getByLabel("Outcome counts")).toContainText("committed: 1");
  const batch=await db.setupImportBatch.findFirstOrThrow({where:{facilityId:f.facility.id}});expect(batch.actorStaffId).toBe(staff.id);expect(batch.actorUserId).toBeNull();expect(await db.user.count({where:{id:staff.id}})).toBe(0);
  const manager=await fixture("MANAGER"),other=await browser.newContext({baseURL});await login(other,manager.token);const denied=await other.newPage();await denied.goto("/employees/bulk-setup");await expect(denied.getByLabel("CSV dataset").locator("option")).toHaveText(["Asset registry"]);expect(await db.setupImportBatch.count({where:{facilityId:manager.facility.id}})).toBe(0);await other.close();
});


test("CSV input failures are actionable before any batch or identity write",async({page,context})=>{
  const f=await fixture();await login(context,f.token);await page.goto("/employees/bulk-setup");
  for(const [text,expected] of [["",/file is empty/],["email,firstName\ncasey@example.com,\"unclosed\n",/unclosed quoted/],["email,password\ncasey@example.com,never-accepted\n",/Unknown, blank or duplicate header/]] as const){
    await page.getByLabel("CSV file",{exact:true}).setInputFiles({name:"workforce.csv",mimeType:"text/csv",buffer:Buffer.from(text)});await page.getByRole("button",{name:"Preview CSV — no mutations"}).click();await expect(page.getByRole("alert").filter({hasText:expected})).toBeVisible();
    expect(await db.setupImportBatch.count({where:{facilityId:f.facility.id}})).toBe(0);expect(await db.user.count({where:{email:f.email}})).toBe(0);
  }
});
