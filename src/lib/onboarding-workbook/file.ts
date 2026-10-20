import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { FACILITY_LOCATION_TYPE_LABELS } from "@/lib/bulk-import/facility-structure";
import { ASSET_CONDITION_VALUES } from "@/lib/asset-operations/ownership";
import { ASSET_CRITICALITY_VALUES } from "@/lib/asset-criticality";
import { RoleKey, EmploymentType } from "@prisma/client";
import { LIMITS, SHEETS, VERSION, WorkbookError, type WorkbookSource, type WorkbookRow } from "./contract";
import { expandWorkbook, xml, deadlineCheck } from "./archive";
export type WorkbookContext = { facilityId:string; name:string; timezone:string; departments:Array<{id:string;key:string;name:string}>; references:Array<[string,string,string]>; assets:boolean };
export async function generateWorkbook(context:WorkbookContext){
  const book=new ExcelJS.Workbook();book.creator="VSSYL";
  const start=book.addWorksheet("Start Here");
  start.addRows([["VSSYL onboarding workbook","Read before filling data sheets"],["Version",VERSION],["Facility ID",context.facilityId],["Site",context.name],["Timezone",context.timezone],["Required","Keep this Start Here sheet and Departments. Data sections are optional; use only the lists you need."],["Entry","All identifiers and data cells are text. Enter codes such as 0012 as text before typing. Numeric, date and formula cells are rejected."],["References","Give a new person/place a unique rowRef (for example p001 or room001). Use ref:p001 in Employee ID, or ref:room001 in locationId / Asset space. References are file-local, never persistent IDs."],["Order","Locations, People, Department Locations, Department Memberships, Assets. Each row commits independently. No workbook-wide rollback."],["Consent","Download/upload changes nothing. Review every proposed row and existing-account match before confirming."],["Recovery","Keep the saved batch ID. Reconcile before retrying; receipt mappings survive interrupted requests. Reviews expire after 30 minutes."],["Metadata","Site and Departments are references only. Edit site facts in guided setup. The workbook cannot license, install or publish anything."],["Credentials","Real email-backed accounts only. No password/PIN columns or exports. Activation and eligible PIN enrollment remain separate People tasks."],["Examples","Examples sheet is never imported. Blank import sheets contain headers only."],["Limits",JSON.stringify(LIMITS)]]);
  start.addRows([
    ["Locations fields","floor is required; neighborhood adds a Unit; locationName + locationType add a Room/place. building, roomNumber, code and description are optional. rowRef enables later references."],
    ["People fields","New people: email, firstName, lastName, roleType, employmentType, primaryDepartment. Existing people: employeeId or exact email plus explicit account-match consent. Other fields are optional assertions; no updates."],
    ["Department Locations fields","department, locationType and locationId are required. UNIT also requires kind; ROOM kind stays blank. Use ref:alias for a Locations row or an exact canonical ID."],
    ["Membership fields","employeeId or email, department and PRIMARY/ADDITIONAL membership are required. Team/Job Role fields are optional; existing relationships are preserved."],
    ["Assets fields","name, equipmentType, floor, neighborhood and at least one stable identifier (assetCode, serialNumber, facilityAssetNumber). Optional space; explicit department or unambiguous Unit default. Existing Asset authority remains required."],
    ["Reference list limit","Reference Values contains up to 800 existing identities/places/organization values. The live canonical references and Builders remain authoritative."],
  ]);
  const departments=book.addWorksheet("Departments");departments.addRows([["id","key","name"],...context.departments.map(d=>[d.id,d.key,d.name])]);
  for(const def of SHEETS){if(def.dataset==="assets"&&!context.assets)continue;const s=book.addWorksheet(def.name);s.addRow([...def.headers]);}
  const references=book.addWorksheet("Reference Values");references.addRows([["type","id / value","name / scope"],...Object.values(RoleKey).map(r=>["roleType",r,""]),...Object.values(EmploymentType).map(r=>["employmentType",r,""]),...FACILITY_LOCATION_TYPE_LABELS.map(r=>["Locations.locationType",r,""]),...["PRIMARY","ADDITIONAL"].map(r=>["membership",r,""]),...["UNIT","ROOM"].map(r=>["locationType",r,""]),...["PRIMARY","BACKUP","SUPPORT"].map(r=>["kind",r,"UNIT only"]),...ASSET_CONDITION_VALUES.map(r=>["Asset status",r,""]),...ASSET_CRITICALITY_VALUES.map(r=>["Asset criticality",r,""]),...context.references]);
  const examples=book.addWorksheet("Examples");examples.addRows([["Section","Example only — never imported"],["Locations","rowRef=room001; floor=Floor 1; neighborhood=Shared Wing; locationName=Room 001; locationType=Resident Room; roomNumber=001"],["People","rowRef=p001; email=real-person@your-site.example; firstName=Casey; lastName=Worker; roleType=STAFF; employmentType=PART_TIME; primaryDepartment=authorized key"],["Department Locations","rowRef=link001; department=authorized key; locationType=ROOM; locationId=ref:room001"],["Department Memberships","rowRef=m001; employeeId=ref:p001; department=another authorized key; membership=ADDITIONAL"],["Assets","Use an authorized Asset operator; name, equipmentType, floor, neighborhood and stable code required. An explicit Department avoids default responsibility ambiguity."]]);
  for(const sheet of book.worksheets){sheet.views=[{state:"frozen",ySplit:1,xSplit:sheet.name==="Start Here"?0:1,showGridLines:false}];sheet.properties.defaultRowHeight=22;sheet.getRow(1).font={name:"Arial",size:11,bold:true,color:{argb:"FFFFFFFF"}};sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF136C65"}};sheet.columns.forEach((column,i)=>{column.width=sheet.name==="Start Here"||sheet.name==="Examples"?(i===0?24:110):32;column.numFmt="@";column.font={name:"Arial",size:11};column.alignment={vertical:"top",wrapText:true};});sheet.getRow(1).font={name:"Arial",size:11,bold:true,color:{argb:"FFFFFFFF"}};}
  start.eachRow(row=>{row.height=row.number>5?44:25;});examples.eachRow(row=>{row.height=48;});
  for(const sheet of book.worksheets)sheet.eachRow(row=>{let lines=1;row.eachCell((cell,index)=>{const width=sheet.getColumn(index).width||32;lines=Math.max(lines,...String(cell.value||"").split("\n").map(line=>Math.ceil(line.length/Math.max(1,width-2))));});row.height=Math.min(409,Math.max(row.height||22,lines*16+8));});
  const bytes=Buffer.from(await book.xlsx.writeBuffer());if(bytes.length>LIMITS.compressed)throw new WorkbookError("Facility references exceed workbook download limits. Use individual lists.");return bytes;
}
export function readWorkbook(bytes:Buffer,fileName:string,facilityId:string):WorkbookSource{
  if(!fileName.toLowerCase().endsWith(".xlsx")||fileName.length>200)throw new WorkbookError("Only supported .xlsx workbooks are accepted; no XLS/XLSM files.");
  const deadline=performance.now()+LIMITS.milliseconds,files=expandWorkbook(bytes,deadline);
  // Validate every part, including unused sheets/styles, before consuming any values.
  for(const text of files.values())xml(text,deadline);
  if(!files.has("xl/workbook.xml")||!files.has("xl/_rels/workbook.xml.rels")||!files.has("[Content_Types].xml"))throw new WorkbookError("Missing standard XLSX package parts.");
  const shared:string[]=[];let string="",inText=false;
  if(files.has("xl/sharedStrings.xml"))xml(files.get("xl/sharedStrings.xml")!,deadline,{open:n=>{if(n==="si")string="";if(n==="t")inText=true;},text:v=>{if(inText){string+=v;if(string.length>LIMITS.text)throw new WorkbookError("Shared string exceeds 2,000 characters.");}},close:n=>{if(n==="t")inText=false;if(n==="si"){shared.push(string);if(shared.length>LIMITS.cells)throw new WorkbookError("Shared string count exceeds limit.");}}});
  const rels=new Map<string,string>();xml(files.get("xl/_rels/workbook.xml.rels")!,deadline,{open:(n,a)=>{if(n==="Relationship"){if(rels.has(a.Id!))throw new WorkbookError("Duplicate workbook relationship.");rels.set(a.Id!,a.Target!);}}});
  const sheets:Array<{name:string;path:string}>=[];xml(files.get("xl/workbook.xml")!,deadline,{open:(n,a)=>{if(n==="sheet"){const target=rels.get(a["r:id"]!);if(!target)throw new WorkbookError("Missing sheet relationship.");const path=target.startsWith("/xl/")?target.slice(1):`xl/${target}`;if(!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)||!files.has(path))throw new WorkbookError("Invalid sheet target.");sheets.push({name:a.name!,path});}}});
  const supported=new Set(["Start Here","Departments","Reference Values","Examples",...SHEETS.map(s=>s.name)]);
  if(sheets.length>LIMITS.sheets||new Set(sheets.map(s=>s.name.toLowerCase())).size!==sheets.length||sheets.some(s=>!supported.has(s.name))||!sheets.some(s=>s.name==="Start Here")||!sheets.some(s=>s.name==="Departments"))throw new WorkbookError("Keep Start Here and Departments; unknown/duplicate sheets or more than nine sheets are unsupported.");
  let cellCount=0,dataRows=0,logicalBytes=0;const rows:WorkbookRow[]=[];
  for(const sheet of sheets){
    const grid=new Map<number,Map<number,string>>();let address="",type="",value="",active=false;const seen=new Set<string>();
    xml(files.get(sheet.path)!,deadline,{open:(n,a)=>{
      if(n==="row"&&(!/^\d+$/.test(a.r||"")||Number(a.r)>LIMITS.rows+1))throw new WorkbookError(`${sheet.name}: row limit exceeded.`);
      if(n==="c"){address=a.r||"";type=a.t||"n";value="";if(!/^[A-Z]{1,2}[1-9]\d*$/.test(address)||seen.has(address)||++cellCount>LIMITS.cells)throw new WorkbookError(`${sheet.name}: invalid/duplicate cell or cell limit exceeded.`);seen.add(address);}
      if(n==="v"||n==="t")active=true;
    },text:v=>{if(active){value+=v;if(value.length>LIMITS.text)throw new WorkbookError(`${sheet.name}!${address}: cell exceeds 2,000 characters.`);}},close:n=>{
      if(n==="v"||n==="t")active=false;
      if(n==="c"){
        const letters=address.match(/^[A-Z]+/)![0];let column=0;for(const c of letters)column=column*26+c.charCodeAt(0)-64;const row=Number(address.slice(letters.length));
        if(column>LIMITS.columns||row>LIMITS.rows+1)throw new WorkbookError(`${sheet.name}!${address}: column/row limit exceeded.`);
        if(value&&!["s","inlineStr","str"].includes(type))throw new WorkbookError(`${sheet.name}!${address}: use a text cell; numeric/date/error cells can lose exact identifiers.`);
        if(type==="s"){if(!/^\d+$/.test(value)||shared[Number(value)]===undefined)throw new WorkbookError("Invalid shared string index.");value=shared[Number(value)]!;}
        logicalBytes+=Buffer.byteLength(value,"utf8");if(logicalBytes>LIMITS.textBytes)throw new WorkbookError("Workbook logical cell text exceeds 2 MB. Split the package or import individual lists.");
        const line=grid.get(row)||new Map<number,string>();line.set(column,value);grid.set(row,line);
      }
    }});
    if(sheet.name==="Start Here"){
      if(grid.get(2)?.get(2)!==VERSION)throw new WorkbookError("Unsupported workbook version. Download the current template.");
      if(grid.get(3)?.get(2)!==facilityId)throw new WorkbookError("Wrong Facility workbook. Download a template in the intended Facility.");continue;
    }
    const def=SHEETS.find(s=>s.name===sheet.name);if(!def)continue;
    const header=grid.get(1);if(!header||header.size!==def.headers.length||def.headers.some((h,i)=>header.get(i+1)!==h))throw new WorkbookError(`${sheet.name}!1: headers must match the current template; credential/lifecycle/unknown columns are rejected.`);
    for(const [row,line] of [...grid.entries()].sort((a,b)=>a[0]-b[0])){
      if(row===1||![...line.values()].some(v=>v.trim()))continue;deadlineCheck(deadline);
      if(++dataRows>LIMITS.rows||(def.dataset==="workforce"&&rows.filter(r=>r.dataset==="workforce").length>=LIMITS.people))throw new WorkbookError("Workbook permits 1,000 data rows total and 500 People.");
      if([...line.keys()].some(c=>c>def.headers.length))throw new WorkbookError(`${sheet.name}!${row}: unexpected data column.`);
      rows.push({id:rows.length+2,sheet:sheet.name,row,dataset:def.dataset,values:Object.fromEntries(def.headers.map((h,i)=>[h,(line.get(i+1)||"").trim()])),errors:[]});
    }
  }
  if(!rows.length)throw new WorkbookError("Workbook contains no import data. Examples are never imported.");
  return {version:VERSION,facilityId,sourceHash:createHash("sha256").update(bytes).digest("hex"),fileName,rows:rows.sort((a,b)=>SHEETS.findIndex(s=>s.dataset===a.dataset)-SHEETS.findIndex(s=>s.dataset===b.dataset)||a.row-b.row).map((r,i)=>({...r,id:i+2}))};
}
