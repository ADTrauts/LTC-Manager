import {createHash} from 'node:crypto';
const ident=(s)=>'c'+createHash('sha256').update(s).digest('hex').slice(0,24);
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { writeFileSync } from 'node:fs';
import { activateFixtureAccount } from './fixture-account.mjs';
import { assertDisposableDatabaseUrl } from './lib/database-target.mjs';
assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.VERIFY_DATABASE_URL)throw Error('Matching disposable URLs required');
if(new URL(process.env.VERIFY_DATABASE_URL).hostname !== '127.0.0.1') throw Error('Local fixture only');
const db = new PrismaClient();
const passwordHash = await bcrypt.hash('PreflightFixture!2026', 10);
const since = new Date('2020-01-01T00:00:00Z');
const date = new Date(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'T00:00:00Z');
const fx = {personas:{},departments:{},spaces:{},units:{},password:'PreflightFixture!2026'};
async function person(key,roleKey,departmentId,facilityId=fx.facilityId) {
 const role=await db.role.upsert({where:{key:roleKey},update:{},create:{key:roleKey,name:roleKey}});
 const user=await db.user.create({data:{id:ident('pf-user-'+key),email:key.toLowerCase()+'@preflight.invalid',displayName:'PF '+key,facilityId,roleId:role.id,passwordHash,isActive:true,primaryDepartmentId:departmentId}});
 await activateFixtureAccount(db,user,{facilityId,roleKey});
 const employee=await db.employee.create({data:{id:ident('pf-employee-'+key),userId:user.id,facilityId,email:user.email,firstName:'PF',lastName:key,status:'ACTIVE',roleType:roleKey,primaryDepartmentId:departmentId}});
 const out={email:user.email,uid:user.id,employeeId:employee.id,facilityId,role:roleKey,primaryDepartmentId:departmentId,scopeKind:'facility',authKind:'user',authMethod:'PASSWORD',name:user.displayName};
 fx.personas[key]=out; return out;
}
try {
 const org=await db.organization.create({data:{id:ident('pf-org'),name:'PF Synthetic Organization',isActive:true}});
 const f=await db.facility.create({data:{id:ident('pf-facility'),organizationId:org.id,displayName:'PF Synthetic Facility',timezone:'America/New_York'}});
 fx.facilityId=f.id;fx.foreignFacilityId=ident('pf-foreign-facility');
 await db.facility.create({data:{id:ident('pf-foreign-facility'),organizationId:org.id,displayName:'PF FOREIGN FACILITY',timezone:'America/New_York'}});
 const floor=await db.unit.create({data:{id:ident('pf-floor'),facilityId:f.id,name:'PF Floor',unitType:'OTHER',hierarchyRole:'FLOOR'}});
 for (const key of ['shared','restricted','foreign']) {
  const foreign=key==='foreign';
  fx.units[key]=(await db.unit.create({data:{id:ident('pf-unit-'+key),facilityId:foreign?ident('pf-foreign-facility'):f.id,parentUnitId:foreign?null:floor.id,name:'PF '+key+' Neighborhood',unitType:'SERVERY',hierarchyRole:'NEIGHBORHOOD',isActive:true}})).id;
 }
 for (const [key,unit] of [['shared','shared'],['dietary','shared'],['evs','shared'],['plant','shared'],['restricted','restricted'],['foreign','foreign']]) {
  fx.spaces[key]=(await db.unitSpace.create({data:{id:ident('pf-space-'+key),facilityId:key==='foreign'?ident('pf-foreign-facility'):f.id,unitId:fx.units[unit],name:'PF PHYSICAL '+key,description:'Shared physical metadata '+key,spaceType:'SERVICE_AREA',isActive:true}})).id;
 }
 for(const [key,n] of [['DIETARY',1],['EVS',2],['PLANT',3],['FOREIGN',4]]) {
  const facilityId=key==='FOREIGN'?ident('pf-foreign-facility'):f.id;
  const dep=await db.department.create({data:{id:ident('pf-dept-'+key).toLowerCase(),facilityId,key:key==='FOREIGN'?'DIETARY':key,name:'PF '+key+' Department',isActive:true,showInEmployeeApp:true,sortOrder:n}});
  fx.departments[key]=dep.id;
  const places=key==='FOREIGN'?['foreign']:['shared',key.toLowerCase(),...(key==='DIETARY'?['restricted']:[])];
  for (const place of places) await db.unitSpaceResponsibility.create({data:{spaceId:fx.spaces[place],departmentId:dep.id,notes:'PF_PRIVATE_NOTE_'+key+'_'+place,capabilities:[]}});
  const def=await db.catalogLogDefinition.create({data:{id:ident('pf-form-'+key),stableKey:ident('pf-form-'+key),name:'PF_PRIVATE_RECORD_'+key,status:'PUBLISHED',purposeType:'LOG',publishedAt:since,ownerKind:'FACILITY',ownerFacilityId:facilityId}});
  await db.facilityCatalogInstall.create({data:{facilityId,catalogDefinitionId:def.id,catalogStableKey:def.stableKey,catalogVersion:1}});
  for (const place of places) await db.logAttachment.create({data:{id:ident('pf-attachment-'+key+'-'+place),stableKey:ident('pf-attachment-'+key+'-'+place),facilityId,departmentId:dep.id,catalogDefinitionId:def.id,catalogStableKey:def.stableKey,catalogVersion:1,effectiveFrom:since,targetKind:'SPACE',spaceId:fx.spaces[place],timingMode:'DAILY_WINDOWS',dailyWindows:{create:{label:'PF_PRIVATE_WINDOW_'+key,startLocal:'00:00',endLocal:'23:59',displaySequence:1}}}});
  const cycle=await db.departmentOperationalCycle.create({data:{id:ident('pf-cycle-'+key),facilityId,departmentId:dep.id,stableKey:ident('pf-cycle-'+key),label:'PF_PRIVATE_CYCLE_'+key,nodeKind:'PERIOD',cycleType:'SERVICE',status:'PUBLISHED',startLocal:'00:00',endLocal:'23:59',applicableDaysOfWeek:[0,1,2,3,4,5,6],effectiveFrom:since,publishedAt:since,locationMode:'EXPLICIT_UNITS',locations:{create:places.map(place=>({spaceId:fx.spaces[place]}))}}});
  await db.operationalAssignmentTemplate.create({data:{id:ident('pf-template-'+key),facilityId,departmentId:dep.id,stableKey:ident('pf-coverage-'+key),name:'PF_PRIVATE_COVERAGE_'+key,status:'PUBLISHED',publishedAt:since,effectiveFrom:since,items:{create:{roleKey:key==='EVS'?'EVS_ATTENDANT':key==='PLANT'?'MAINTENANCE_TECH':'DIETARY_AIDE',roleLabel:'PF_PRIVATE_ROLE_'+key,spaceId:fx.spaces[places[0]],requiredCount:key==='DIETARY'?2:n,startsAtLocal:'00:00',endsAtLocal:'23:59'}}}});
  await db.departmentTeam.create({data:{id:ident('pf-team-'+key),facilityId,departmentId:dep.id,displayName:'PF_PRIVATE_TEAM_'+key,roomMemberships:{create:places.map(place=>({spaceId:fx.spaces[place]}))}}});
  if(key==='DIETARY') await db.menu.create({data:{id:ident('pf-menu'),facilityId,departmentId:dep.id,name:'PF_PRIVATE_MENU_DIETARY',status:'ACTIVE',locationApplicability:{create:{spaceId:fx.spaces.shared}}}});
  const evidenceId=ident('pf-evidence-'+key);
  await db.operationalEvidenceRecord.upsert({where:{id:evidenceId},update:{},create:{id:evidenceId,facilityId,departmentId:dep.id,catalogDefinitionId:def.id,templateStableKey:def.stableKey,templateVersion:1,templateName:'PF_PRIVATE_EVIDENCE_'+key,purposeType:'LOG',requirementKey:ident('pf-evidence-requirement-'+key),operationalDate:date,scheduleKind:'AD_HOC',spaceId:fx.spaces[places[0]],unitId:fx.units[key==='FOREIGN'?'foreign':'shared'],occurredAt:new Date(),templateSnapshotJson:{snapshotSchemaVersion:2,fields:[],sections:[],name:'PF_PRIVATE_EVIDENCE_'+key},recordedByLabel:'PF Synthetic'}});
 }
 const dietary=await person('dietary','MANAGER',fx.departments.DIETARY);
 await person('evsNative','MANAGER',fx.departments.EVS);
 const multi=await person('multi','MANAGER',fx.departments.DIETARY);
 for(const key of ['DIETARY','PLANT']) await db.department.update({where:{id:fx.departments[key]},data:{headEmployeeId:multi.employeeId}});
 await person('facilityWide','FACILITY_ADMINISTRATOR',null);
 fx.personas.readOnly=fx.personas.facilityWide;
 const limited=await person('limited','STAFF',fx.departments.DIETARY);
 await db.employee.update({where:{id:limited.employeeId},data:{primaryUnitId:fx.units.shared}});
 await db.employeeUnitAccess.create({data:{employeeId:limited.employeeId,unitId:fx.units.shared}});
 const plan=await db.operationalAssignmentPlan.create({data:{facilityId:f.id,departmentId:fx.departments.DIETARY,serviceDate:date,status:'CONFIRMED'}});
 await db.operationalAssignment.create({data:{facilityId:f.id,departmentId:fx.departments.DIETARY,employeeId:limited.employeeId,serviceDate:date,planId:plan.id,status:'ACTIVE',roleKey:'DIETARY_AIDE',roleLabel:'PF Assigned Dietary',unitId:fx.units.shared,startsAt:new Date(date.getTime()+5*3600000),endsAt:new Date(date.getTime()+29*3600000),locations:{create:{unitSpaceId:fx.spaces.shared,unitId:fx.units.shared}}}});
 await db.employeeTeamMembership.create({data:{employeeId:limited.employeeId,teamId:ident('pf-team-DIETARY')}});
 // EVS stays DEVELOPMENT. Its existing partner manager route is supported by the
 // live partner authorization model; no Product status or feature policy is changed.
 const vendor=await db.organization.create({data:{id:ident('pf-vendor'),name:'PF Synthetic EVS Operator',isActive:true}});
 const operator=await db.departmentOperatorRelationship.create({data:{departmentId:fx.departments.EVS,organizationId:vendor.id,effectiveFrom:since}});
 const evs=await db.user.create({data:{id:ident('pf-user-evs'),email:'evs@preflight.invalid',displayName:'PF EVS Partner',passwordHash,isActive:true,emailVerifiedAt:since}});
 const partnership=await db.facilityPartnerOrganization.create({data:{id:ident('pf-partnership'),facilityId:f.id,organizationId:vendor.id,createdByUserId:dietary.uid}});
 await db.facilityPartnerAccessPeriod.create({data:{facilityPartnerOrganizationId:partnership.id,startsAt:since}});
 await db.facilityPartnerDepartmentScope.create({data:{facilityPartnerOrganizationId:partnership.id,departmentId:fx.departments.EVS,startsAt:since}});
 await db.facilityPartnerRoleCeilingPeriod.create({data:{facilityPartnerOrganizationId:partnership.id,maxPartnerRole:'PARTNER_MANAGER',startsAt:since}});
 const membership=await db.userOrganizationMembership.create({data:{userId:evs.id,organizationId:vendor.id}});
 await db.userOrganizationRolePeriod.create({data:{membershipId:membership.id,role:'ORG_MEMBER',startsAt:since}});
 const grant=await db.partnerUserFacilityAccess.create({data:{userId:evs.id,facilityPartnerOrganizationId:partnership.id,createdByUserId:dietary.uid}});
 await db.partnerUserRolePeriod.create({data:{partnerUserFacilityAccessId:grant.id,partnerRole:'PARTNER_MANAGER',startsAt:since,createdByAuthorityKind:'facility_admin'}});
 await db.departmentVendorHeadAssignment.create({data:{departmentId:fx.departments.EVS,operatorRelationshipId:operator.id,assigneeUserId:evs.id,assignedByUserId:dietary.uid,status:'ACCEPTED',acceptedAt:since}});
 await db.operationalEvidenceRecord.updateMany({where:{departmentId:fx.departments.EVS},data:{operatorPeriodId:operator.id}});
 fx.personas.evs={uid:evs.id,email:evs.email,facilityId:f.id,scopeKind:'facility',accessKind:'partner',authKind:'user',authMethod:'PASSWORD',name:'PF EVS Partner',partnerOrganizationId:vendor.id,facilityPartnerOrganizationId:partnership.id};
 fx.foreignEvidenceId=ident('pf-evidence-FOREIGN');fx.evsEvidenceId=ident('pf-evidence-EVS');
 writeFileSync('tmp/phase2d-fixtures.json',JSON.stringify(fx,null,2),{mode:0o600});
 console.log('Fixture ready: 2 facilities, 4 departments, 6 spaces, populated independent notes/Records/Coverage/Teams, 7 accounts plus native EVS boundary account.');
} finally {await db.$disconnect();}
