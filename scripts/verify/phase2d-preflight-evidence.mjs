import {PrismaClient} from '@prisma/client';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {assertDisposableDatabaseUrl} from './lib/database-target.mjs';
assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.VERIFY_DATABASE_URL || new URL(process.env.VERIFY_DATABASE_URL).hostname!=='127.0.0.1')throw Error('Matching localhost disposable URLs required');
const ident=s=>'c'+createHash('sha256').update(s).digest('hex').slice(0,24);
const fx=JSON.parse(readFileSync('tmp/phase2d-fixtures.json','utf8'));const db=new PrismaClient();
const date=new Date(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'T00:00:00Z');
try{for(const key of Object.keys(fx.departments)){
 const dep=await db.department.findUniqueOrThrow({where:{id:fx.departments[key]}});
 const def=await db.catalogLogDefinition.findUniqueOrThrow({where:{id:ident('pf-form-'+key)}});
 const operator=await db.departmentOperatorRelationship.findFirst({where:{departmentId:dep.id}});
 const id=ident('pf-evidence-'+key);
 await db.operationalEvidenceRecord.upsert({where:{id},update:{},create:{id,facilityId:dep.facilityId,departmentId:dep.id,operatorPeriodId:operator?.id??null,catalogDefinitionId:def.id,templateStableKey:def.stableKey,templateVersion:1,templateName:'PF_PRIVATE_EVIDENCE_'+key,purposeType:'LOG',requirementKey:ident('pf-evidence-requirement-'+key),operationalDate:date,scheduleKind:'AD_HOC',spaceId:fx.spaces[key==='FOREIGN'?'foreign':'shared'],unitId:fx.units[key==='FOREIGN'?'foreign':'shared'],occurredAt:new Date(),templateSnapshotJson:{snapshotSchemaVersion:2,fields:[],sections:[],name:'PF_PRIVATE_EVIDENCE_'+key},recordedByLabel:'PF Synthetic'}});
 fx[key.toLowerCase()+'EvidenceId']=id;
}writeFileSync('tmp/phase2d-fixtures.json',JSON.stringify(fx,null,2),{mode:0o600});console.log('Populated completed evidence for each Department, including foreign Facility.');}finally{await db.$disconnect();}
