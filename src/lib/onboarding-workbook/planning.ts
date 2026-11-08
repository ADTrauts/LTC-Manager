import type { FacilitySession } from "@/lib/auth";
import { liveActor, type Db } from "@/lib/setup-imports/authority";
import { loadCatalog, type Catalog } from "@/lib/setup-imports/catalog";
import { loadFacilityStructureCatalog } from "@/lib/bulk-import/facility-structure-execute";
import { orderedFacilityCreatePlan } from "@/lib/bulk-import/facility-structure";
import { planImport } from "@/lib/setup-imports/planner";
import { hash, parseSource, type PlanRow, type Operation } from "@/lib/setup-imports/contract";
import { HEADERS } from "@/lib/setup-imports/public-contract";
import { csv, type WorkbookSource, type WorkbookRow } from "./contract";
export type Mapping = Record<string,Record<string,string>>;
export type PlannedWorkbookRow = WorkbookRow & { plan:PlanRow; dependencies:string[]; cells:Array<{field:string;column:string;value:string}> };
export const referenceKey=(dataset:string,ref:string)=>`${dataset}:${ref}`;
export function rowSource(row:WorkbookRow,values=row.values){return parseSource(row.dataset,csv(HEADERS[row.dataset],[values]),`${row.sheet}.csv`);}
export type CheckpointVersion = 2 | undefined;
/** Retire only completed People with no pending consumer. Keep raw references as
 * well as planned dependencies: blocked rows can fail before dependency planning.
 * Non-People rows and all Facility catalogs retain their conservative scope. */
export function checkpointRows(source:WorkbookSource,rows:PlannedWorkbookRow[],mapping:Mapping,version:CheckpointVersion){
  if(version===undefined)return source.rows;
  const key=(r:WorkbookRow)=>referenceKey(r.dataset,r.values.rowRef||String(r.id));
  const pending=rows.filter(row=>!mapping[key(row)]);
  const needed=new Set<string>(),employeeIds=new Set<string>(),emails=new Set<string>();
  let unresolvedEmail=false;
  for(const row of pending){
    if(row.values.employeeId)employeeIds.add(row.values.employeeId);
    if(row.plan.operation?.employeeId)employeeIds.add(row.plan.operation.employeeId);
    if(row.values.email){emails.add(row.values.email.toLowerCase());if(!row.plan.operation?.employeeId)unresolvedEmail=true;}
    for(const dependency of row.dependencies)needed.add(dependency);
    if(row.values.employeeId?.startsWith("ref:"))needed.add(referenceKey("workforce",row.values.employeeId.slice(4)));
  }
  return source.rows.filter(row=>{
    const committed=mapping[key(row)];
    if(row.dataset!=="workforce"||!committed||needed.has(key(row)))return true;
    if(employeeIds.has(committed.employeeId!)||employeeIds.has(row.values.employeeId!))return true;
    // A pending literal alias consumes the same person too. If a reviewed reuse
    // has no email and a pending email could not resolve, do not guess it unused.
    return row.values.email?emails.has(row.values.email.toLowerCase()):unresolvedEmail;
  });
}
export async function workbookCatalog(db:Db,session:FacilitySession,source:WorkbookSource,identityRows:WorkbookRow[]=source.rows){
  const joined={...rowSource(source.rows[0]!),dataset:source.rows.some(r=>r.dataset==="assets")?"assets" as const:"workforce" as const,rows:identityRows.map(r=>({row:r.id,ref:r.values.rowRef||String(r.id),values:r.values,errors:r.errors}))};
  if (source.rows.some(r=>r.dataset==="assets")) await liveActor(db,session,session.facilityId,"assets");
  const catalog=await loadCatalog(db,session,joined);catalog.structure=await loadFacilityStructureCatalog(db,session.facilityId);catalog.structure.departments=catalog.departments;return catalog;
}
function facts(v:unknown):unknown{if(v instanceof Date)return v.toISOString();if(Array.isArray(v))return v.map(facts).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v).filter(([k])=>!["createdAt","updatedAt"].includes(k)).map(([k,x])=>[k,facts(x)]));return v;}
export const checkpoint=(catalog:Catalog)=>hash(facts(catalog));
export function resolveValues(row:WorkbookRow,mapping:Mapping,catalog:Catalog){
  const values={...row.values};const dependencies:string[]=[];
  const get=(value:string,dataset:string)=>{const key=referenceKey(dataset,value.slice(4));dependencies.push(key);const found=mapping[key];if(!found)throw Error(`Missing or uncommitted local reference ${value}. Its source row must succeed first.`);return found;};
  if(values.employeeId?.startsWith("ref:"))values.employeeId=get(values.employeeId,"workforce").employeeId!;
  if(values.locationId?.startsWith("ref:")){const target=get(values.locationId,"locations");if(values.locationType!==target.locationType)throw Error("Location reference type disagrees with its source row.");values.locationId=target.locationId!;}
  if(row.dataset==="assets")for(const field of ["floor","neighborhood","space"]){if(values[field]?.startsWith("ref:")){const target=get(values[field]!,"locations");const id=field==="floor"?target.floorId:field==="neighborhood"?target.unitId:target.spaceId;const item=field==="space"?catalog.spaces.find(s=>s.id===id):catalog.units.find(s=>s.id===id);if(!item)throw Error(`${field} reference has no canonical ${field}.`);values[field]=item.id;}}
  return {values,dependencies};
}
/** In-memory projection of canonical plans. file:* labels are symbolic review nodes,
 * never database IDs or identities. Actual execution resolves receipts instead. */
function projectLocation(c:Catalog,op:Operation,seed:string):Record<string,string>{
  const plan=op.locationPlan!,ops=orderedFacilityCreatePlan(plan),s=c.structure!;const ids=new Map<string,string>();
  for(const r of plan.rows){if(r.existingBuildingId)ids.set(r.buildingKey,r.existingBuildingId);if(r.existingFloorId)ids.set(r.floorKey,r.existingFloorId);if(r.existingNeighborhoodId)ids.set(r.neighborhoodKey,r.existingNeighborhoodId);}
  const make=(key:string,name:string,role:"BUILDING"|"FLOOR"|"NEIGHBORHOOD",parent:string|null)=>{const id=`file:${seed}:${key}`;ids.set(key,id);s.units.push({id,name,hierarchyRole:role,parentUnitId:parent,isActive:true,displayOrder:0,description:null});c.units.push({id,name,hierarchyRole:role,isActive:true});c.assets?.units.push({id,name,hierarchyRole:role,parentUnitId:parent,isActive:true});};
  for(const b of ops.buildings)make(b.key,b.name,"BUILDING",null);
  for(const f of ops.floors)make(f.key,f.name,"FLOOR",f.buildingKey?ids.get(f.buildingKey)!:null);
  for(const n of ops.neighborhoods)make(n.key,n.name,"NEIGHBORHOOD",ids.get(n.floorKey)!);
  for(const place of ops.spaces){const id=`file:${seed}:${place.key}`,unitId=ids.get(place.neighborhoodKey)!;s.spaces.push({id,unitId,name:place.name,spaceType:place.spaceType,customTypeLabel:place.customTypeLabel,roomNumber:place.roomNumber,code:place.code,description:place.description,isActive:true,sortOrder:0});c.spaces.push({id,unitId,name:place.name,isActive:true});c.assets?.spaces.push({id,unitId,name:place.name,isActive:true});}
  const row=plan.rows[0]!,floorId=ids.get(row.floorKey)!,unitId=ids.get(row.neighborhoodKey),space=s.spaces.find(x=>x.unitId===unitId&&x.name.toLowerCase()===row.spaceName.toLowerCase());
  return {locationId:row.intent==="location"?space!.id:row.intent==="neighborhood"?unitId!:floorId,locationType:row.intent==="location"?"ROOM":"UNIT",floorId,...(unitId?{unitId}:{}),...(space?{spaceId:space.id}:{})};
}
function projectPerson(c:Catalog,op:Operation,seed:string){
  if(op.employeeId)return {employeeId:op.employeeId,userId:op.userId!};
  const id=`file:${seed}`,uid=op.userId||`${id}:user`,user=c.users.find(u=>u.id===op.userId);
  const virtual={id:uid,email:op.email,isActive:true,sessionVersion:0,hasPassword:false,emailVerifiedAt:null,...user,facilityAccesses:[...(user?.facilityAccesses||[]),{facilityId:c.facility.id,isActive:true,revokedAt:null,rolePeriods:[{roleKey:op.roleType,startsAt:new Date(0),endsAt:null}]}]};
  c.employees.push({id,userId:uid,email:op.email,firstName:op.firstName,lastName:op.lastName,phone:op.phone||null,roleType:op.roleType,employmentType:op.employmentType,status:"ACTIVE",terminationDate:null,primaryDepartmentId:op.departmentId,jobTitleId:op.jobTitleId||null,sessionVersion:0,employeeDepartments:[],teamMemberships:op.teamId?[{teamId:op.teamId,isPrimary:true}]:[],departmentJobRoles:op.jobRoleId?[{departmentId:op.departmentId,jobRoleId:op.jobRoleId}]:[],user:virtual} as unknown as Catalog["employees"][number]);return {employeeId:id,userId:uid};
}
export function planWorkbook(source:WorkbookSource,input:Catalog):PlannedWorkbookRow[]{
  const catalog=structuredClone(input),mapping:Mapping={};const responsibilitySources=new Map<string,string[]>();const refs=new Set<string>();
  // Reject duplicated local aliases and repeated identity/relationship intent before projection.
  const duplicates=new Set<string>(),targets=new Map<string,number[]>();
  const identity=(row:WorkbookRow)=>{const v=row.values;return row.dataset==="workforce"?`person:${(v.employeeId||v.email||"").toLowerCase()}`:row.dataset==="employee_departments"?`member:${v.employeeId||v.email}:${v.department}`:row.dataset==="department_locations"?`place:${v.locationType}:${v.locationId}:${v.department}`:row.dataset==="locations"?`location:${v.building}:${v.floor}:${v.neighborhood}:${v.locationName}`:`asset:${v.assetCode||v.serialNumber||v.facilityAssetNumber}`;};
  for(const row of source.rows){const key=referenceKey(row.dataset,row.values.rowRef||String(row.id));if(refs.has(key))duplicates.add(key);refs.add(key);const target=identity(row),list=targets.get(target)||[];list.push(row.id);targets.set(target,list);}
  const duplicateRows=new Set([...targets.values()].filter(ids=>ids.length>1).flat());
  return source.rows.map(row=>{
    let dependencies:string[]=[];let plan:PlanRow;
    try{
      const key=referenceKey(row.dataset,row.values.rowRef||String(row.id));if(duplicates.has(key)||duplicateRows.has(row.id))throw Error("Duplicate local reference or duplicate input row.");
      const resolved=resolveValues(row,mapping,catalog);dependencies=resolved.dependencies;const sourceRow=rowSource(row,resolved.values);plan=planImport(sourceRow,catalog,null,new Date())[0]!;
      if(plan.operation){const op=plan.operation;if(op.kind==="assets"&&!row.values.department)dependencies.push(...(responsibilitySources.get(op.unitId!)||[]));if(row.dataset==="locations")mapping[key]=projectLocation(catalog,op,String(row.id));else if(row.dataset==="workforce")mapping[key]=projectPerson(catalog,op,String(row.id));
        else if(row.dataset==="department_locations"&&op.locationType==="UNIT"&&plan.action!=="reuse"){const value={id:`file:responsibility:${row.id}`,unitId:op.locationId!,departmentId:op.departmentId!,kind:op.responsibilityKind!};catalog.unitResponsibilities.push(value as Catalog["unitResponsibilities"][number]);catalog.assets?.responsibilities?.push(value);responsibilitySources.set(op.locationId!,[...(responsibilitySources.get(op.locationId!)||[]),key]);}
      }
    }catch(e){plan={row:2,ref:row.values.rowRef||String(row.id),label:row.values.email||row.values.locationName||row.values.name||row.values.employeeId||row.sheet,action:"blocked",message:(e as Error).message,beforeHash:"",operation:null,requiresAccountConfirmation:null};}
    return {...row,plan:{...plan,row:row.id},dependencies,cells:HEADERS[row.dataset].map((field,i)=>({field,column:String.fromCharCode(65+i),value:row.values[field]||""})).filter(c=>c.value)};
  });
}
