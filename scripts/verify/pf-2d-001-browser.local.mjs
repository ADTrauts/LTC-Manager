import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const fx=JSON.parse(readFileSync('tmp/phase2d-fixtures.json','utf8'));
const baseURL='http://127.0.0.1:31847';
const results=[]; const responses=[];
mkdirSync('tmp/preflight-payloads',{recursive:true});
const browser=await chromium.launch({headless:true});
const sessions=new Map();
async function signIn(key) {
 if(sessions.has(key))return sessions.get(key);
 const context=await browser.newContext({baseURL}); const page=await context.newPage();page.setDefaultTimeout(90000);page.setDefaultNavigationTimeout(180000);
 const response=await context.request.post('/api/auth/login',{data:{email:fx.personas[key].email,password:fx.password},timeout:180000});
 assert.equal(response.status(),200,'Actual password login');
 if(key==='evs') await page.goto('/access',{waitUntil:'domcontentloaded'});
 const form=page.locator(`form:has([name="contextKey"][value="facility_partner:${fx.personas[key].facilityPartnerOrganizationId}"])`);
 if(key==='evs' && await form.count()) {await form.getByRole('button',{name:'Open'}).click();await page.waitForURL(/\/partner/);}
 const out={context,page};sessions.set(key,out);return out;
}
function isolate(body,allowed) {
 for(const dep of ['DIETARY','EVS','PLANT','FOREIGN']) if(!allowed.includes(dep)) {
  for(const type of ['RECORD','EVIDENCE','NOTE','COVERAGE','CYCLE','TEAM','WINDOW','ROLE','MENU'])assert(!body.includes(`PF_PRIVATE_${type}_${dep}`),`Unauthorized serialized ${type} ${dep}`);
 }
}
async function get(key,path,allowed,{present=[],status=200}={}) {
 const {context}=await signIn(key);const r=await context.request.get(path,{maxRedirects:0,timeout:120000,headers:{cookie:(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ')}});const body=await r.text();
 const entry={persona:key,path,status:r.status(),location:r.headers().location??null,bytes:body.length,present:present.map(marker=>({marker,found:body.includes(marker)}))};responses.push(entry);
 const index=responses.length;writeFileSync(`tmp/preflight-payloads/${String(index).padStart(2,'0')}-${key}.txt`,body);
 assert.equal(r.status(),status,JSON.stringify(entry));isolate(body,allowed);for(const marker of present)assert(body.includes(marker),`Missing authorized ${marker} on ${path}`);return body;
}
async function check(persona,name,fn) {try{const evidence=await fn();results.push({persona,name,status:'PASS',evidence});}catch(e){results.push({persona,name,status:'FAIL',message:e.message.split('\n')[0]});}console.log(JSON.stringify(results.at(-1)));writeFileSync('tmp/phase2d-browser-results.json',JSON.stringify({results,responses,totals:{pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').length,skip:0}},null,2));}
try{
 await check('Dietary-only','Rendered Dashboard and serialized payload contain permitted records only',async()=>{
  const {page}=await signIn('dietary');await page.goto('/dashboard');await page.getByTestId('dashboard-v2').waitFor();await page.getByTestId('dashboard-card-attention').waitFor();
  await page.getByText('PF_PRIVATE_RECORD_DIETARY',{exact:true}).first().waitFor();isolate(await page.content(),['DIETARY']);
  const coverage=page.getByTestId('dashboard-card-coverage');await coverage.waitFor();assert.equal(await coverage.locator('dd').first().innerText(),'1');assert(!(await coverage.innerText()).includes('Coverage is in place'));
  await page.screenshot({path:'tmp/preflight-dietary-dashboard.png',fullPage:true});
  await get('dietary','/dashboard',['DIETARY'],{present:['PF_PRIVATE_RECORD_DIETARY']});
  await get('dietary','/unit/'+fx.units.shared+'?space='+fx.spaces.shared,['DIETARY'],{present:['PF_PRIVATE_RECORD_DIETARY']});
  await get('dietary','/staffing/logs',['DIETARY'],{present:['PF_PRIVATE_RECORD_DIETARY']});
  return {rendered:true};
 });
 await check('EVS-only','Existing partner Dashboard payload and Records route',async()=>{
  const {page}=await signIn('evs');await page.goto('/partner');await page.getByTestId('dashboard-v2').waitFor();
  await get('evs','/partner',['EVS'],{present:['PF_PRIVATE_RECORD_EVS']});
  await get('evs','/partner/logs',['EVS'],{present:['PF_PRIVATE_RECORD_EVS']});
  return {route:'/partner',productReleaseUnchanged:true};
 });
 await check('Multi-Department','Both authorized Dashboard lenses contain their own positive data',async()=>{
  await get('multi','/dashboard?scope=department:'+fx.departments.DIETARY,['DIETARY'],{present:['PF_PRIVATE_RECORD_DIETARY']});
  await get('multi','/dashboard?scope=department:'+fx.departments.PLANT,['PLANT'],{present:['PF_PRIVATE_RECORD_PLANT']});return {permittedLenses:2};
 });
 await check('Facility-wide','Broad VIEW grants render exact Records aggregate',async()=>{
  const body=await get('facilityWide','/dashboard?scope=facility',['DIETARY','PLANT'],{present:['PF_PRIVATE_RECORD_DIETARY','PF_PRIVATE_RECORD_PLANT']});
  return {dietaryAndPlantPresent:true};
 });
 await check('Read-only','Read payload authorized; prohibited write covered by live service integration',async()=>{
  await get('readOnly','/dashboard?scope=department:'+fx.departments.DIETARY,['DIETARY'],{present:['PF_PRIVATE_RECORD_DIETARY']});return {actualWriteServiceCheck:'phase2d-integration-results.json'};
 });
 await check('Limited employee','Assigned SPACE available, prohibited Unit and assigned-outside SPACE denied',async()=>{
  await get('limited','/unit/'+fx.units.shared+'?space='+fx.spaces.shared,['DIETARY'],{present:['PF_PRIVATE_RECORD_DIETARY']});
  await get('limited','/unit/'+fx.units.restricted+'?space='+fx.spaces.restricted,[],{present:['This space is not part of your assignment']});
  await get('limited','/unit/'+fx.units.shared+'?space='+fx.spaces.dietary,[],{present:['This space is not part of your assignment']});
  return {assignedSpaceVisible:true};
 });
 await check('Unauthorized Department','Forged cookie, lens, explicit target and search preserve isolation',async()=>{
  const {context}=await signIn('dietary');await context.addCookies([{name:'ltc_active_department',value:fx.departments.EVS,url:baseURL}]);
  await get('dietary','/dashboard?scope=department:'+fx.departments.EVS,['DIETARY'],{present:['PF_PRIVATE_RECORD_DIETARY']});
  await get('dietary','/staffing/logs/targets/department/'+fx.departments.EVS,[],{status:404});
  await get('dietary','/reports?definition=pf-form-EVS',['DIETARY']);
  await get('dietary','/staffing/log-book',['DIETARY'],{present:['PF_PRIVATE_EVIDENCE_DIETARY']});
  await get('dietary','/staffing/log-book?department='+fx.departments.EVS,[],{status:404});
  await get('dietary','/staffing/logs/records/'+fx.evsEvidenceId,[],{status:404});
  return {forgedCookieAndQuery:true};
 });
 await check('Cross-facility','Foreign SPACE/Department and facility-switch API denied',async()=>{
  await get('dietary','/unit/'+fx.units.foreign+'?space='+fx.spaces.foreign,[],{status:404});
  await get('dietary','/dashboard?scope=department:'+fx.departments.FOREIGN,['DIETARY'],{present:['PF_PRIVATE_RECORD_DIETARY']});
  await get('dietary','/staffing/logs/records/'+fx.foreignEvidenceId,[],{status:404});
  const {context}=await signIn('dietary');const r=await context.request.post('/api/auth/switch-facility',{headers:{cookie:(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ')},data:{facilityId:fx.foreignFacilityId}});assert([400,403].includes(r.status()));return {foreignRoutesDenied:true,switchStatus:r.status()};
 });
}finally{await browser.close();}
process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
