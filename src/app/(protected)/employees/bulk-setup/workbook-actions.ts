"use server";
import { employeeVisibleWhere, loadDepartmentVisibility, visibleDepartmentIdList } from "@/lib/department-authority/visibility";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { liveActor } from "@/lib/setup-imports/authority";
import { loadCustomerOperableDepartments } from "@/lib/department-products/load-facility-catalog";
import { resolveAssetOperationsAuthority } from "@/lib/asset-operations/authority";
import { generateWorkbook } from "@/lib/onboarding-workbook/file";
import { LIMITS, WorkbookError } from "@/lib/onboarding-workbook/contract";
import { previewWorkbook, confirmWorkbook, workbookResults, type WorkbookPreview, type WorkbookResults } from "@/lib/onboarding-workbook/service";
import { ImportError, type Outcome } from "@/lib/setup-imports/contract";
const message=(e:unknown)=>e instanceof WorkbookError||e instanceof ImportError?e.message:"Workbook request interrupted. Reconcile stored receipts before retrying.";
async function file(data:FormData,optional=false){const value=data.get("file");if(optional&&value===null)return {};if(!(value instanceof File)||!value.size||value.size>LIMITS.compressed)throw new WorkbookError("Choose a supported .xlsx up to 5 MiB.");return {bytes:Buffer.from(await value.arrayBuffer()),fileName:value.name};}
export async function downloadOnboardingWorkbook():Promise<Outcome<{base64:string;name:string}>>{
  try{
    const session=await requireFacilitySession();await liveActor(prisma,session,session.facilityId,"workforce");
    const visibility=await loadDepartmentVisibility(prisma,session,session.facilityId);
    const visibleIds=visibleDepartmentIdList(visibility);
    const employeeWhere=visibility?{AND:[{facilityId:session.facilityId},employeeVisibleWhere(visibility)]}:{facilityId:session.facilityId};
    const [facility,loadedDepartments,people,units,spaces,teams,jobs,titles]=await Promise.all([
      prisma.facility.findUniqueOrThrow({where:{id:session.facilityId},select:{displayName:true,timezone:true}}),loadCustomerOperableDepartments(prisma,session.facilityId),
      prisma.employee.findMany({where:employeeWhere,select:{id:true,firstName:true,lastName:true,email:true},take:300,orderBy:{id:"asc"}}),
      prisma.unit.findMany({where:visibleIds?{facilityId:session.facilityId,isActive:true,OR:[{departmentResponsibilities:{some:{departmentId:{in:[...visibleIds]}}}},{childSpaces:{some:{responsibilities:{some:{departmentId:{in:[...visibleIds]}}}}}}]}:{facilityId:session.facilityId,isActive:true},select:{id:true,name:true},take:300,orderBy:{id:"asc"}}),
      prisma.unitSpace.findMany({where:visibleIds?{facilityId:session.facilityId,isActive:true,responsibilities:{some:{departmentId:{in:[...visibleIds]}}}}:{facilityId:session.facilityId,isActive:true},select:{id:true,name:true},take:300,orderBy:{id:"asc"}}),
      prisma.departmentTeam.findMany({where:visibleIds?{facilityId:session.facilityId,status:"ACTIVE",departmentId:{in:[...visibleIds]}}:{facilityId:session.facilityId,status:"ACTIVE"},select:{id:true,displayName:true,departmentId:true},take:100}),
      prisma.departmentJobRole.findMany({where:visibleIds?{facilityId:session.facilityId,status:"ACTIVE",departmentId:{in:[...visibleIds]}}:{facilityId:session.facilityId,status:"ACTIVE"},select:{id:true,displayName:true,departmentId:true},take:100}),
      prisma.jobTitle.findMany({where:{facilityId:session.facilityId,isActive:true},select:{id:true,name:true},take:100}),
    ]);
    const departments=loadedDepartments.filter((department)=>!visibility||visibility.pageDepartmentIds.has(department.id));
    let assets=false;for(const d of departments)if((await resolveAssetOperationsAuthority(session,session.facilityId,d.id)).canManageAssets)assets=true;
    const references:Array<[string,string,string]>=[...people.map(p=>["EMPLOYEE",p.id,`${p.firstName} ${p.lastName} (${p.email||""})`] as [string,string,string]),...units.map(p=>["UNIT",p.id,p.name] as [string,string,string]),...spaces.map(p=>["ROOM",p.id,p.name] as [string,string,string]),...teams.map(p=>["TEAM",p.id,`${p.displayName} / ${p.departmentId}`] as [string,string,string]),...jobs.map(p=>["JOB_ROLE",p.id,`${p.displayName} / ${p.departmentId}`] as [string,string,string]),...titles.map(p=>["JOB_TITLE",p.id,p.name] as [string,string,string])];
    const bytes=await generateWorkbook({facilityId:session.facilityId,name:facility.displayName,timezone:facility.timezone,departments,references:references.slice(0,800),assets});await liveActor(prisma,session,session.facilityId,"workforce");return {ok:true,data:{base64:bytes.toString("base64"),name:`vssyl-onboarding-${session.facilityId}-v1.xlsx`}};
  }catch(e){return {ok:false,error:message(e)};}
}
export async function previewOnboardingWorkbook(data:FormData):Promise<Outcome<WorkbookPreview>>{try{const session=await requireFacilitySession();await liveActor(prisma,session,String(data.get("expectedFacilityId")),"workforce");const f=await file(data);return {ok:true,data:await previewWorkbook(prisma,session,f.bytes!,f.fileName!,String(data.get("expectedFacilityId"))) };}catch(e){return {ok:false,error:message(e)};}}
export async function confirmOnboardingWorkbook(data:FormData):Promise<Outcome<WorkbookResults>>{try{const session=await requireFacilitySession();await liveActor(prisma,session,String(data.get("expectedFacilityId")),"workforce");return {ok:true,data:await confirmWorkbook(prisma,session,{...await file(data,true),reviewToken:String(data.get("reviewToken")),expectedFacilityId:String(data.get("expectedFacilityId")),confirmedAccountRows:data.getAll("confirmedAccountRow").map(Number)})};}catch(e){return {ok:false,error:message(e)};}}
export async function reconcileOnboardingWorkbook(id:string):Promise<Outcome<WorkbookResults>>{try{return {ok:true,data:await workbookResults(prisma,await requireFacilitySession(),id)};}catch(e){return {ok:false,error:message(e)};}}
