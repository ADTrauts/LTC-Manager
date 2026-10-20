import { confirmedRollback, importTransaction } from "@/lib/setup-imports/transaction";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { liveActor, lockAuthority, lockFacility, lockDependencies, type Db } from "@/lib/setup-imports/authority";
import { hash, ImportError, readReview, type Results } from "@/lib/setup-imports/contract";
import { previewImport, confirmImport, getImportResults } from "@/lib/setup-imports/service";
import { WorkbookError, type WorkbookSource } from "./contract";
import { readWorkbook } from "./file";
import { workbookCatalog, planWorkbook, checkpoint, checkpointRows, resolveValues, referenceKey, rowSource, type PlannedWorkbookRow, type Mapping, type CheckpointVersion } from "./planning";
import { csv } from "./contract";
import { HEADERS } from "@/lib/setup-imports/public-contract";
type Review={id:string;facilityId:string;actor:string;digest:string;sourceHash:string;expiresAt:number;checkpointVersion?:CheckpointVersion};
export type WorkbookPreview={batchId:string;reviewToken:string;expiresAt:string;rows:PlannedWorkbookRow[];fileName:string};
type Child={batchId:string;reviewToken:string;text:string;fileName:string;checkpoint?:string;attemptToken?:string};
type Stored={source:WorkbookSource;rows:PlannedWorkbookRow[];checkpoint:string;reviewedCheckpoint:string;mapping:Mapping;children:Record<string,Child>;history?:Record<string,Child[]>;checkpointVersion?:CheckpointVersion};
function intentDigest(source:WorkbookSource,rows:PlannedWorkbookRow[],state:string,version:CheckpointVersion){
  return hash({source,rows,checkpoint:state,...(version===2?{checkpointVersion:version}:{})});
}
function matchesIntent(stored:Stored,review:Review){
  return stored.checkpointVersion===review.checkpointVersion&&intentDigest(stored.source,stored.rows,stored.reviewedCheckpoint,stored.checkpointVersion)===review.digest;
}
const protectedRows=(stored:Stored)=>checkpointRows(stored.source,stored.rows,stored.mapping,stored.checkpointVersion);
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const secret=()=>{if(!process.env.AUTH_SECRET)throw new WorkbookError("Review signing is not configured.");return process.env.AUTH_SECRET;};
function sign(r:Review){const body=Buffer.from(JSON.stringify(r)).toString("base64url");return `${body}.${createHmac("sha256",secret()).update(`workbook/1:${body}`).digest("base64url")}`;}
function read(token:string){try{if(token.length>3000)throw Error();const [b,s,extra]=token.split(".");if(!b||!s||extra)throw Error();const expected=createHmac("sha256",secret()).update(`workbook/1:${b}`).digest(),actual=Buffer.from(s,"base64url");if(actual.length!==expected.length||!timingSafeEqual(expected,actual))throw Error();const r=JSON.parse(Buffer.from(b,"base64url").toString()) as Review;if(!r.id||!Number.isFinite(r.expiresAt)||(r.checkpointVersion!==undefined&&r.checkpointVersion!==2))throw Error();return r;}catch{throw new WorkbookError("Invalid workbook review. Preview again.");}}
async function authority(db:Db,session:FacilitySession,r:Review,lock=false){const actor=lock?await lockAuthority(db as Prisma.TransactionClient,session,"workforce"):await liveActor(db,session,r.facilityId,"workforce");if(r.facilityId!==session.facilityId||hash(actor)!==r.actor)throw new ImportError("Workbook actor or Facility authority changed.");if(r.expiresAt<=Date.now())throw new ImportError("Workbook review expired. Reconcile receipts, then preview remaining intent again.");return actor;}
export async function previewWorkbook(db:PrismaClient,session:FacilitySession,bytes:Buffer,fileName:string,expectedFacilityId:string):Promise<WorkbookPreview>{
  const actor=await liveActor(db,session,expectedFacilityId,"workforce"),source=readWorkbook(bytes,fileName,session.facilityId),catalog=await workbookCatalog(db,session,source),rows=planWorkbook(source,catalog),state=checkpoint(catalog);
  const review:Review={id:randomUUID(),facilityId:session.facilityId,actor:hash(actor),sourceHash:source.sourceHash,digest:intentDigest(source,rows,state,2),checkpointVersion:2,expiresAt:Date.now()+30*60_000};
  return {batchId:review.id,reviewToken:sign(review),expiresAt:new Date(review.expiresAt).toISOString(),rows,fileName};
}
async function loadOwned(db:Db,session:FacilitySession,id:string){const batch=await db.setupImportBatch.findUnique({where:{id}});if(!batch)throw new WorkbookError("No confirmed workbook receipt exists yet. Select the reviewed file and submit the same review, or preview a fresh workbook.");if(batch.dataset!=="onboarding_workbook"||batch.facilityId!==session.facilityId||batch.actorKind!==session.authKind||(batch.actorKind==="user"?batch.actorUserId:batch.actorStaffId)!==session.uid)throw new WorkbookError("Workbook batch is not available in this actor/Facility context.");await liveActor(db,session,session.facilityId,"workforce");return batch;}
export async function workbookResults(db:PrismaClient,session:FacilitySession,id:string){
  const batch=await loadOwned(db,session,id),stored=batch.reviewedPlan as unknown as Stored;
  const claimFailures=await db.setupImportResult.findMany({where:{batchId:id,phase:"WORKBOOK_ATTEMPT"},orderBy:{attempt:"asc"}});
  const rows=[];let childRunning=false;
  for(const row of stored.rows){
    const child=stored.children[row.id];let result:Results["rows"][number]|null=null;const attempts:Array<{batchId:string;status:string;message:string}>=[];
    for(const receipt of [...(stored.history?.[row.id]||[]),...(child?[child]:[])]){
      let currentRow:Results["rows"][number]|null=null,running=false;
      try{const current=await getImportResults(db,session,receipt.batchId);running=current.running;childRunning ||= running;currentRow=current.rows[0]||null;}catch{/* Unknown is never inferred success. */}
      const failures=claimFailures.filter(f=>f.rowNumber===row.id&&(f.targetIds as Record<string,string>).childBatchId===receipt.batchId);
      for(const failure of failures.filter(f=>f.status==="failed"))attempts.push({batchId:receipt.batchId,status:failure.status,message:failure.message});
      const latest=failures.at(-1),failedThisAttempt=latest?.status==="failed"&&(!receipt.attemptToken||(latest.targetIds as Record<string,string>).attemptToken===receipt.attemptToken);
      if(currentRow?.result||running||!failedThisAttempt)attempts.push({batchId:receipt.batchId,status:currentRow?.result?.status||"unknown",message:currentRow?.result?.message||"Reconcile this child outcome."});
      if(!currentRow?.result&&!running&&failedThisAttempt){const failure=latest!;currentRow={row:2,ref:row.plan.ref,label:row.plan.label,requiresAccountConfirmation:row.plan.requiresAccountConfirmation,delivery:null,result:{row:2,phase:failure.phase,attempt:failure.attempt,status:failure.status,message:failure.message,targetIds:{},createdAt:failure.createdAt.toISOString()}};}
      if(receipt.batchId===child?.batchId)result=currentRow;
    }
    rows.push({id:row.id,sheet:row.sheet,row:row.row,label:row.plan.label,status:result?.result?.status||(row.plan.action==="blocked"?"blocked":"unknown"),message:result?.result?.message||(row.plan.action==="blocked"?row.plan.message:row.dependencies.some(key=>!stored.mapping[key])?"Not attempted: waiting for committed prerequisite receipts.":"No confirmed child outcome. Reconcile before retrying."),targetIds:result?.result?.targetIds||{},childBatchId:child?.batchId||null,attempts,enrollment:result?.enrollment,requiresAccountConfirmation:row.plan.requiresAccountConfirmation});
  }
  return {batchId:id,fileName:batch.fileName,running:childRunning||(!!batch.leaseExpiresAt&&+batch.leaseExpiresAt>Date.now()),expiresAt:batch.expiresAt.toISOString(),mapping:stored.mapping,rows};
}
export type WorkbookResults=Awaited<ReturnType<typeof workbookResults>>;
export async function confirmWorkbook(db:PrismaClient,session:FacilitySession,input:{reviewToken:string;expectedFacilityId:string;bytes?:Buffer;fileName?:string;confirmedAccountRows:number[]}){
  const review=read(input.reviewToken);if(input.expectedFacilityId!==session.facilityId)throw new WorkbookError("Facility changed. Preview in the intended site.");
  const supplied=input.bytes?readWorkbook(input.bytes,input.fileName||"",session.facilityId):null;if(supplied&&supplied.sourceHash!==review.sourceHash)throw new WorkbookError("Workbook bytes changed. Preview again.");
  const lease=randomUUID();const claimed=await importTransaction(db,async tx=>{
    const actor=await authority(tx,session,review,true);await lockFacility(tx,session.facilityId);await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${review.id} FOR UPDATE`);
    let batch=await tx.setupImportBatch.findUnique({where:{id:review.id}});
    if(!batch){if(!supplied)throw new WorkbookError("First confirmation requires the same reviewed workbook.");const catalog=await workbookCatalog(tx,session,supplied),rows=planWorkbook(supplied,catalog),state=checkpoint(catalog);if(intentDigest(supplied,rows,state,review.checkpointVersion)!==review.digest)throw new WorkbookError("Material facts changed since preview. Preview again before execution.");await authority(tx,session,review);batch=await tx.setupImportBatch.create({data:{id:review.id,facilityId:session.facilityId,actorKind:session.authKind!,actorUserId:session.authKind==="user"?session.uid:null,actorStaffId:session.authKind==="harbor_staff"?session.uid:null,actorSnapshot:json(actor),dataset:"onboarding_workbook",mode:"dependency_order",contractVersion:"vssyl.onboarding.xlsx/1",fileName:supplied.fileName,sourceHash:supplied.sourceHash,planDigest:review.digest,expiresAt:new Date(review.expiresAt),reviewedPlan:json({source:supplied,rows,checkpoint:state,reviewedCheckpoint:state,mapping:{},children:{},checkpointVersion:review.checkpointVersion})}});}
    await loadOwned(tx,session,review.id);if(batch.planDigest!==review.digest||(batch.reviewedPlan as unknown as Stored).checkpointVersion!==review.checkpointVersion)throw new WorkbookError("Workbook review does not match its receipt.");if(batch.leaseExpiresAt&&+batch.leaseExpiresAt>Date.now())return false;
    await tx.setupImportBatch.update({where:{id:review.id},data:{leaseToken:lease,leaseExpiresAt:new Date(Date.now()+90_000)}});return true;
  },{timeout:30000,maxWait:30000});
  if(!claimed)return workbookResults(db,session,review.id);
  const guard=async(tx:Prisma.TransactionClient)=>{await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${review.id} FOR UPDATE`);const batch=await loadOwned(tx,session,review.id);if(batch.leaseToken!==lease||!batch.leaseExpiresAt||+batch.leaseExpiresAt<=Date.now())throw new ImportError("Workbook execution lease changed. Reconcile before retrying.");const stored=batch.reviewedPlan as unknown as Stored;
    if(!matchesIntent(stored,review))throw new ImportError("Stored workbook intent changed. Preview again.");
    const receipts=await tx.setupImportResult.findMany({where:{batchId:review.id,phase:"WORKBOOK",status:{in:["committed","reused"]}},orderBy:{attempt:"asc"}}),mapping:Mapping={};
    for(const receipt of receipts){const row=stored.rows.find(r=>r.id===receipt.rowNumber);if(!row)throw new ImportError("Unexpected workbook receipt.");mapping[referenceKey(row.dataset,row.values.rowRef||String(row.id))]=receipt.targetIds as Record<string,string>;}
    if(hash(mapping)!==hash(stored.mapping))throw new ImportError("Workbook reference mappings do not match committed receipts.");
    const identityRows=protectedRows(stored);await lockDependencies(tx,session.facilityId,identityRows.map(r=>({...rowSource(r).rows[0]!,row:r.id})));if(checkpoint(await workbookCatalog(tx,session,stored.source,identityRows))!==stored.checkpoint)throw new ImportError("External material changes require a renewed workbook preview. Earlier receipts remain committed.");await authority(tx,session,review);return stored;};
  try{
    let attempted=0;
    const initial=await workbookResults(db,session,review.id);
    const visited=new Set<number>();
    while(attempted<25){
      let stored=(await loadOwned(db,session,review.id)).reviewedPlan as unknown as Stored;
      const ready=initial.rows.filter(result=>{
        const candidate=stored.rows.find(r=>r.id===result.id)!;
        return !visited.has(result.id)&&!["committed","reused"].includes(result.status)&&candidate.plan.action!=="blocked"&&(result.status!=="blocked"||stored.children[result.id]?.checkpoint!==stored.checkpoint)&&candidate.dependencies.every(key=>Boolean(stored.mapping[key]))&&(!candidate.plan.requiresAccountConfirmation||input.confirmedAccountRows.includes(candidate.id));
      });
      // New ready work must not starve behind repeated failures. Stable sheet order
      // remains the tie-breaker; reference prerequisites always precede dependants.
      const result=ready.find(r=>r.status==="unknown")||ready[0];if(!result)break;
      visited.add(result.id);attempted++;
      const row=stored.rows.find(r=>r.id===result.id)!;
      let child=stored.children[row.id];
      if(!child||(["failed","blocked"].includes(result.status)&&child.checkpoint!==stored.checkpoint)){
        const values=resolveValues(row,stored.mapping,await workbookCatalog(db,session,stored.source)).values;
        const text=csv(HEADERS[row.dataset],[values]);const preview=await previewImport(db,session,{dataset:row.dataset,text,fileName:`${row.sheet}.csv`,expectedFacilityId:session.facilityId});
        // Workbook progress alone does not require a new child identity. In
        // particular, an exhausted claim has no batch to refresh: retain the
        // original review when its canonical row intent still matches exactly.
        const sameUnclaimedReview=child&&!await db.setupImportBatch.findUnique({where:{id:child.batchId}})&&readReview(child.reviewToken).planDigest===readReview(preview.reviewToken).planDigest;
        if(!sameUnclaimedReview){
        const previousChild=child;child={batchId:preview.batchId,reviewToken:preview.reviewToken,text,fileName:preview.fileName,checkpoint:stored.checkpoint};
        await importTransaction(db,async tx=>{await authority(tx,session,review,true);await lockFacility(tx,session.facilityId);const current=await guard(tx);
          if(previousChild){
            await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${previousChild.batchId} FOR UPDATE`);
            const old=await tx.setupImportBatch.findUnique({where:{id:previousChild.batchId}}),outcomes=await tx.setupImportResult.findMany({where:{batchId:previousChild.batchId,phase:"IMPORT"},orderBy:{attempt:"desc"}});
            const claimAttempt=await tx.setupImportResult.findFirst({where:{batchId:review.id,rowNumber:row.id,phase:"WORKBOOK_ATTEMPT"},orderBy:{attempt:"desc"}});
            const absentRolledBackClaim=!old&&claimAttempt?.status==="failed"&&(claimAttempt.targetIds as Record<string,string>).childBatchId===previousChild.batchId&&(!previousChild.attemptToken||(claimAttempt.targetIds as Record<string,string>).attemptToken===previousChild.attemptToken);
            if(!absentRolledBackClaim&&(!old||(old.leaseExpiresAt&&+old.leaseExpiresAt>Date.now())||outcomes.some(r=>["committed","reused"].includes(r.status))||!["failed","blocked"].includes(outcomes[0]?.status||"")))throw new ImportError("Reconcile the running/unknown child outcome before refreshing any review.");
            current.history ||= {};current.history[row.id]=[...(current.history[row.id]||[]),previousChild];
            const attempt=await tx.setupImportResult.count({where:{batchId:review.id,rowNumber:row.id,phase:"WORKBOOK_REVIEW"}});
            await tx.setupImportResult.create({data:{batchId:review.id,rowNumber:row.id,phase:"WORKBOOK_REVIEW",attempt:attempt+1,status:"prepared",intendedKey:row.plan.ref,targetIds:json({previousBatchId:previousChild.batchId,batchId:child!.batchId}),message:"Canonical child review refreshed after verified commits from this workbook; prior receipts retained.",confirmedDigest:review.digest}});
          }
          current.children[row.id]=child!;await tx.setupImportBatch.update({where:{id:review.id},data:{reviewedPlan:json(current),leaseExpiresAt:new Date(Date.now()+90_000)}});},{timeout:30000,maxWait:30000});
        }
      }
      // Persist the attempted identity before calling a child, including retries.
      // A lost response must not expose an older failed attempt as today's result.
      const claimGuard=async(tx:Prisma.TransactionClient)=>{
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${review.id} FOR UPDATE`);
        const current=await guardAfterWrite(tx);
        if(!matchesIntent(current,review)||current.children[row.id]?.batchId!==child.batchId)throw new ImportError("Workbook child intent changed. Reconcile before continuing.");
        return current;
      };
      await importTransaction(db,async tx=>{await authority(tx,session,review,true);await lockFacility(tx,session.facilityId);const current=await claimGuard(tx);
        // Unknown is coordination, not an authoritative outcome. Keep its token
        // with the existing child/lease instead of adding a receipt write to
        // every row's claim. Failed outcomes below remain append-only receipts.
        child={...current.children[row.id]!,attemptToken:randomUUID()};current.children[row.id]=child;
        await tx.setupImportBatch.update({where:{id:review.id},data:{reviewedPlan:json(current),leaseExpiresAt:new Date(Date.now()+90_000)}});
      },{timeout:30000,maxWait:30000});
      try{await confirmImport(db,session,{reviewToken:child.reviewToken,expectedFacilityId:session.facilityId,text:child.text,fileName:child.fileName,confirmedAccountRows:input.confirmedAccountRows.includes(row.id)?[2]:[]},{beforeClaim:async tx=>{await claimGuard(tx);},before:async tx=>{await guard(tx);},after:async(tx,_plan,outcome)=>{
        stored=await guardAfterWrite(tx);stored.mapping[referenceKey(row.dataset,row.values.rowRef||String(row.id))]=outcome.targetIds;
        stored.checkpoint=checkpoint(await workbookCatalog(tx,session,stored.source,protectedRows(stored)));
        await tx.setupImportBatch.update({where:{id:review.id},data:{reviewedPlan:json(stored),leaseExpiresAt:new Date(Date.now()+90_000)}});
        const prior=await tx.setupImportResult.count({where:{batchId:review.id,rowNumber:row.id,phase:"WORKBOOK"}});
        await tx.setupImportResult.create({data:{batchId:review.id,rowNumber:row.id,phase:"WORKBOOK",attempt:prior+1,status:outcome.status,intendedKey:referenceKey(row.dataset,row.values.rowRef||String(row.id)),targetIds:json(outcome.targetIds),message:outcome.message,confirmedDigest:review.digest}});
      }});}catch(error){
        // A child claim can exhaust all five confirmed rollback attempts before
        // its batch exists. It is one attempted workbook row, not a failure of
        // every remaining row. Never retry the claim again in this request.
        if(error instanceof ImportError||error instanceof WorkbookError)throw error;
        if(!confirmedRollback(error))break; // uncertain COMMIT: same identity must reconcile first
        const reconciled=await importTransaction(db,async tx=>{
          await authority(tx,session,review,true);await lockFacility(tx,session.facilityId);
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${review.id} FOR UPDATE`);
          const current=await guardAfterWrite(tx);
          if(!matchesIntent(current,review)||current.children[row.id]?.batchId!==child.batchId||current.children[row.id]?.attemptToken!==child.attemptToken)throw new ImportError("Workbook child intent changed. Reconcile before continuing.");
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${child.batchId} FOR UPDATE`);
          const existing=await tx.setupImportBatch.findUnique({where:{id:child.batchId}});
          const outcomes=await tx.setupImportResult.findMany({where:{batchId:child.batchId,phase:"IMPORT"},orderBy:{attempt:"desc"}});
          // A receipt always wins over the exception; an active claim is unknown.
          if(outcomes.length)return true;
          if(existing?.leaseExpiresAt&&+existing.leaseExpiresAt>Date.now())return false;
          const attempt=await tx.setupImportResult.count({where:{batchId:review.id,rowNumber:row.id,phase:"WORKBOOK_ATTEMPT"}});
          await tx.setupImportResult.create({data:{batchId:review.id,rowNumber:row.id,phase:"WORKBOOK_ATTEMPT",attempt:attempt+1,status:"failed",intendedKey:row.plan.ref,targetIds:json({childBatchId:child.batchId,attemptToken:child.attemptToken!}),message:"Child claim rolled back after bounded contention retries; no committed row receipt found. Continue with the same child identity. Earlier rows remain committed.",confirmedDigest:review.digest}});
          return true;
        },{timeout:30000,maxWait:30000});
        if(!reconciled)break;
      }
    }
  }finally{await db.setupImportBatch.updateMany({where:{id:review.id,leaseToken:lease},data:{leaseToken:null,leaseExpiresAt:null}});}
  return workbookResults(db,session,review.id);
  async function guardAfterWrite(tx:Prisma.TransactionClient){const b=await loadOwned(tx,session,review.id);if(b.leaseToken!==lease||!b.leaseExpiresAt||+b.leaseExpiresAt<=Date.now())throw new ImportError("Workbook lease changed or expired.");await authority(tx,session,review);return b.reviewedPlan as unknown as Stored;}
}
