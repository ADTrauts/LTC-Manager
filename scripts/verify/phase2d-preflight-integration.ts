import assert from 'node:assert/strict';
import {assertDisposableDatabaseUrl} from './lib/database-target.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {prisma} from '../../src/lib/prisma';
import {resolveDashboardViewer} from '../../src/lib/dashboard/viewer/resolve';
import {createDashboardFactPack} from '../../src/lib/dashboard/facts';
import {loadRecords,loadCoverage,loadAttention} from '../../src/lib/dashboard/cards/load';
import {resolveDepartmentAccessMap} from '../../src/lib/department-authority/resolve';
import {resolveTeamAuthority,createDepartmentTeam,loadTeamsForDepartment} from '../../src/lib/department-teams/service';
import {resolveViewerTeamScopes as teamScopes} from '../../src/lib/dashboard/viewer/viewer-team-scope';
import {loadDepartmentSpaceNotes} from '../../src/lib/department-administration/department-space-notes';
import {resolveViewerTeamScopes as placement} from '../../src/lib/dashboard/viewer/operational-placement';
import {isUnitAllowedForEmployee} from '../../src/lib/employee-units';
import {prefetchRuntimeLocationInputs,loadRuntimeLocationStates,composeRuntimeLocationStates} from '../../src/lib/runtime-location-state';
import {matchCoverageItemToLocation} from '../../src/lib/scheduling/coverage-expectations';
import {searchEvidenceRecords} from '../../src/lib/operational-evidence/log-book';
assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.VERIFY_DATABASE_URL || new URL(process.env.VERIFY_DATABASE_URL!).hostname!=='127.0.0.1')throw Error('Matching localhost disposable URLs required');
const fx=JSON.parse(readFileSync('tmp/phase2d-fixtures.json','utf8'));
const results:any[]=[]; const snapshots:any={};
async function check(persona:string,name:string,fn:()=>Promise<unknown>) {
 try { const evidence=await fn(); results.push({persona,name,status:'PASS',evidence}); }
 catch(e:any) {results.push({persona,name,status:'FAIL',message:e.message});}
 console.log(JSON.stringify(results.at(-1)));
}
async function viewer(key:string,scopeParam?:string) {
 const s=fx.personas[key];
 const r=await resolveDashboardViewer(s,{scopeParam},{db:prisma,resolveEmployeeId:async()=>s.employeeId??null});
 assert.equal(r.kind,'viewer'); if(r.kind!=='viewer')throw Error('Missing viewer'); return r.viewer;
}
function isolated(value:any,allowed:string[]) {
 const s=JSON.stringify(value);
 for(const k of ['DIETARY','EVS','PLANT','FOREIGN']) if(!allowed.includes(k)) {
  for(const marker of ['PF_PRIVATE_RECORD_','PF_PRIVATE_EVIDENCE_','PF_PRIVATE_NOTE_','PF_PRIVATE_COVERAGE_','PF_PRIVATE_CYCLE_','PF_PRIVATE_TEAM_','PF_PRIVATE_WINDOW_','PF_PRIVATE_ROLE_']) assert(!s.includes(marker+k),`Unauthorized marker ${marker+k}`);
 }
}
async function facts(key:string,dep:string,count:number,scopeParam?:string) {
 const v=await viewer(key,scopeParam); const pack=createDashboardFactPack(v);
 assert.deepEqual(pack.departmentIds,[fx.departments[dep]]);
 const records=await pack.runLogRequirements(fx.departments[dep]);
 assert.equal(records.length,count,'Populated canonical requirement count'); isolated(records,[dep]);
 assert(JSON.stringify(records).includes('PF_PRIVATE_RECORD_'+dep),'Authorized Records marker present');
 const states=await pack.runtimeLocations();
 assert(states.length>0,'Populated Runtime Location State');
 assert(states.every(s=>s.identity.location.departmentId===fx.departments[dep])); isolated(states,[dep]);
 const cards={records:await loadRecords({viewer:v,facts:pack,size:'L'}),coverage:await loadCoverage({viewer:v,facts:pack,size:'L'}),attention:await loadAttention({viewer:v,facts:pack,size:'L'})};
 assert.equal(cards.records.state,'ready');
 if(cards.records.state==='ready')assert.equal(cards.records.model.metrics.find(m=>m.label==='Due')?.value,count,'Exact authorized Due aggregate');
 assert(states.every(s=>s.readiness.availability==='deferred_legacy_engine' && s.readiness.state===null),'Current RLS contract defers readiness; no invented score');
 isolated(cards,[dep]);
 snapshots[key+'-'+dep]={viewer:v,records,states,cards};
 return {departmentIds:pack.departmentIds,requirements:records.length,runtimeStates:states.length,cards};
}
async function main(){
 await check('Dietary-only','Actual viewer, Records, RLS, cards and aggregates',()=>facts('dietary','DIETARY',3));
 await check('EVS-only','Production partner grants, populated EVS facts and aggregates',()=>facts('evs','EVS',2));
 await check('Multi-Department','Permitted Dietary and Plant layers both present',async()=>{
  const v=await viewer('multi'); assert.deepEqual([...v.scopeDepartmentIds].sort(),[fx.departments.DIETARY,fx.departments.PLANT].sort());
  return {dietary:await facts('multi','DIETARY',3),plant:await facts('multi','PLANT',2,'department:'+fx.departments.PLANT)};
 });
 await check('Facility-wide','Live CDA grants and exact 3 + 2 requirement aggregate',async()=>{
  const v=await viewer('facilityWide','facility'); assert.equal(v.scope?.kind,'FACILITY');
  const access=await resolveDepartmentAccessMap(prisma,fx.personas.facilityWide,{facilityId:fx.facilityId,departmentIds:Object.values(fx.departments) as string[]});
  assert.equal(access.get(fx.departments.DIETARY)?.mode,'VIEW');assert.equal(access.get(fx.departments.PLANT)?.mode,'VIEW');assert.equal(access.get(fx.departments.EVS)?.mode,'SUMMARY');assert(!access.has(fx.departments.FOREIGN));
  const p=createDashboardFactPack(v);assert.deepEqual([...p.departmentIds].sort(),[fx.departments.DIETARY,fx.departments.PLANT].sort());
  const requirements=(await Promise.all(p.departmentIds.map(id=>p.runLogRequirements(id)))).flat(); assert.equal(requirements.length,5);isolated(requirements,['DIETARY','PLANT']);
  const cards={records:await loadRecords({viewer:v,facts:p,size:'L'}),attention:await loadAttention({viewer:v,facts:p,size:'L'})};
  assert.equal(cards.records.state,'ready');if(cards.records.state==='ready')assert.equal(cards.records.model.metrics.find(m=>m.label==='Due')?.value,5);
  snapshots.facility={requirements,cards};return {grants:Object.fromEntries([...access].map(([id,a])=>[id,a.mode])),requirements:requirements.length,cards};
 });
 await check('Read-only','Read is permitted while actual Team create service denies',async()=>{
  const s=fx.personas.readOnly;const a=await resolveTeamAuthority(s,fx.facilityId,fx.departments.DIETARY);assert.equal(a.canView,true);assert.equal(a.canManage,false);
  const before=await prisma.departmentTeam.count();
  await assert.rejects(()=>createDepartmentTeam(s,{facilityId:fx.facilityId,departmentId:fx.departments.DIETARY,displayName:'PF_FORBIDDEN_WRITE',spaceIds:[]}));
  assert.equal(await prisma.departmentTeam.count(),before);
  const p=createDashboardFactPack(await viewer('readOnly','department:'+fx.departments.DIETARY));assert.equal((await p.runLogRequirements(fx.departments.DIETARY)).length,3); return a;
 });
 await check('Limited employee','Supported Dashboard denial, explicit Unit access, assigned room placement',async()=>{
  const s=fx.personas.limited;const r=await resolveDashboardViewer(s,{}, {db:prisma});assert.equal(r.kind,'not_eligible');
  assert(await isUnitAllowedForEmployee(s.employeeId,fx.facilityId,fx.units.shared));assert.equal(await isUnitAllowedForEmployee(s.employeeId,fx.facilityId,fx.units.restricted),false);
  const p=await placement({session:s,facilityId:fx.facilityId,departments:[{id:fx.departments.DIETARY,label:'PF DIETARY'}],db:prisma,resolveEmployeeId:async()=>s.employeeId});assert.deepEqual(p.get(fx.departments.DIETARY)?.roomIds,[fx.spaces.shared]); return [...p.values()];
 });
 await check('Unauthorized Department','Forged lens and fact calls cannot expand scope',async()=>{
  const v=await viewer('dietary','department:'+fx.departments.EVS);assert.equal(v.scope?.kind,'DEPARTMENT');assert.equal(v.scope && 'departmentId' in v.scope?v.scope.departmentId:null,fx.departments.DIETARY);
  const p=createDashboardFactPack(v);await assert.rejects(()=>p.runLogRequirements(fx.departments.EVS),/outside/);await assert.rejects(()=>p.dailyCoverage(fx.departments.EVS),/outside/);return facts('dietary','DIETARY',3,'department:'+fx.departments.EVS);
 });
 await check('Cross-facility','Foreign identifiers are omitted and foreign Team write denied',async()=>{
  const s=fx.personas.dietary;const access=await resolveDepartmentAccessMap(prisma,s,{facilityId:fx.facilityId,departmentIds:[fx.departments.FOREIGN]});assert.equal(access.size,0);
  const a=await resolveTeamAuthority(s,fx.foreignFacilityId,fx.departments.FOREIGN);assert.equal(a.canView,false);assert.equal(a.canManage,false);
  const v=await viewer('dietary','department:'+fx.departments.FOREIGN);assert(!v.scopeDepartmentIds.includes(fx.departments.FOREIGN));return {accessEntries:access.size,authority:a};
 });
 await check('Shared physical room','Independent notes read from same physical identity',async()=>{
  const d=await loadDepartmentSpaceNotes(prisma,{facilityId:fx.facilityId,departmentId:fx.departments.DIETARY,spaceIds:[fx.spaces.shared]});const e=await loadDepartmentSpaceNotes(prisma,{facilityId:fx.facilityId,departmentId:fx.departments.EVS,spaceIds:[fx.spaces.shared]});
  assert.equal(d.get(fx.spaces.shared),'PF_PRIVATE_NOTE_DIETARY_shared');assert.equal(e.get(fx.spaces.shared),'PF_PRIVATE_NOTE_EVS_shared'); return {sameSpaceId:fx.spaces.shared,dietary:[...d],evs:[...e]};
 });
 await check('Coverage regression','Published Space target survives actual RLS prefetch',async()=>{
  const dep=fx.departments.DIETARY;const raw=await prisma.operationalAssignmentTemplate.findFirstOrThrow({where:{departmentId:dep},include:{items:true}});
  assert.equal(raw.items[0].spaceId,fx.spaces.shared);
  const plan=await prisma.operationalAssignmentPlan.findFirstOrThrow({where:{departmentId:dep}});
  const now=new Date(plan.serviceDate.toISOString().slice(0,10)+'T17:00:00Z');
  const loaded=await prefetchRuntimeLocationInputs({facilityId:fx.facilityId,spaceRefs:[{departmentId:dep,spaceId:fx.spaces.shared}],now});
  const item=loaded.coverageTemplatesByDepartmentId.get(dep)?.[0]?.items[0];
  snapshots.coveragePrefetch={databaseTarget:raw.items[0].spaceId,prefetchedItem:item};
  assert.equal(item?.spaceId,fx.spaces.shared,'RLS prefetch must retain published explicit Space targeting');return item;
 });
 await check('Coverage regression','Configured two-person Space need appears in RLS payload',async()=>{
  const dep=fx.departments.DIETARY;const plan=await prisma.operationalAssignmentPlan.findFirstOrThrow({where:{departmentId:dep}});
  const now=new Date(plan.serviceDate.toISOString().slice(0,10)+'T17:00:00Z');
  const loaded=await loadRuntimeLocationStates({facilityId:fx.facilityId,spaceRefs:[{departmentId:dep,spaceId:fx.spaces.shared}],now});
  const state=loaded.states[0];assert.equal(state.operation.state,'ACTIVE','Control: explicitly published active Cycle');
  snapshots.coveragePayload=state;assert.equal(state.coverage.slots.length,1,'One configured Space Coverage slot must not disappear');
 });
 await check('Coverage diagnostic control','Same canonical composition admits Space and Unit targets when field is retained in test memory',async()=>{
  const dep=fx.departments.DIETARY;const plan=await prisma.operationalAssignmentPlan.findFirstOrThrow({where:{departmentId:dep}});const now=new Date(plan.serviceDate.toISOString().slice(0,10)+'T17:00:00Z');
  const p=await prefetchRuntimeLocationInputs({facilityId:fx.facilityId,spaceRefs:[{departmentId:dep,spaceId:fx.spaces.shared}],now});
  const rows=p.coverageTemplatesByDepartmentId.get(dep)!;
  const m=new Map(p.coverageTemplatesByDepartmentId);
  m.set(dep,rows.map(row=>({...row,items:row.items.map(item=>({...item,spaceId:fx.spaces.shared}))})));
  const space=composeRuntimeLocationStates({...p,coverageTemplatesByDepartmentId:m})[0];assert.equal(space.coverage.slots.length,1);assert.equal(space.coverage.slots[0].requiredCount,2);assert.equal(space.coverage.slots[0].filledCount,1);assert.equal(space.coverage.slots[0].state,'AT_RISK');
  m.set(dep,rows.map(row=>({...row,items:row.items.map(item=>({...item,spaceId:null,unitId:fx.units.shared}))})));
  const unit=composeRuntimeLocationStates({...p,coverageTemplatesByDepartmentId:m})[0];assert.equal(unit.coverage.slots.length,1);
  return {testMemoryOnly:true,spaceSlots:space.coverage.slots.length,unitSlots:unit.coverage.slots.length,required:space.coverage.slots[0].requiredCount,filled:space.coverage.slots[0].filledCount,intendedState:space.coverage.slots[0].state};
 });
 await check('Evidence search','Populated authorized result and unauthorized Department/Facility denial',async()=>{
  const s=fx.personas.dietary;const found=await searchEvidenceRecords(s,{facilityId:fx.facilityId,departmentId:fx.departments.DIETARY});assert.equal(found.records.length,1);isolated(found,['DIETARY']);assert(JSON.stringify(found).includes('PF_PRIVATE_EVIDENCE_DIETARY'));
  await assert.rejects(()=>searchEvidenceRecords(s,{facilityId:fx.facilityId,departmentId:fx.departments.EVS}));
  await assert.rejects(()=>searchEvidenceRecords(s,{facilityId:fx.foreignFacilityId,departmentId:fx.departments.FOREIGN}));return {authorizedRecords:found.records.length};
 });
 await check('Teams','Explicit Department Team rooms and Assignment placement stay distinct',async()=>{
  const dep=fx.departments.DIETARY;const s=fx.personas.limited;
  const teams=await loadTeamsForDepartment(prisma,{facilityId:fx.facilityId,departmentId:dep});assert.equal(teams.length,1);isolated(teams,['DIETARY']);
  const scopes=await teamScopes({session:s,facilityId:fx.facilityId,departments:[{id:dep,label:'PF DIETARY'}],db:prisma,resolveEmployeeId:async()=>s.employeeId});
  assert.deepEqual([...scopes.get(dep)!.roomIds].sort(),[fx.spaces.shared,fx.spaces.dietary,fx.spaces.restricted].sort());
  const denied=await resolveTeamAuthority(fx.personas.dietary,fx.facilityId,fx.departments.EVS);assert.equal(denied.canView,false);return {teamCount:teams.length,teamRooms:scopes.get(dep)!.roomIds.length,assignedRooms:1};
 });
 writeFileSync('tmp/phase2d-integration-results.json',JSON.stringify({results,totals:{pass:results.filter(r=>r.status==='PASS').length,fail:results.filter(r=>r.status==='FAIL').length,skip:0}},null,2));
 writeFileSync('tmp/phase2d-synthetic-snapshots.json',JSON.stringify(snapshots,null,2));
 process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
 await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exitCode=1});
