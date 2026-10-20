import { inflateRawSync } from "node:zlib";
import { SaxesParser } from "saxes";
import { LIMITS, WorkbookError } from "./contract";
const crcTable = Array.from({length:256},(_,n) => { for(let i=0;i<8;i++)n=n&1 ? 0xedb88320^(n>>>1) : n>>>1;return n>>>0; });
function crc(bytes: Buffer){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]!^(n>>>8);return(n^0xffffffff)>>>0;}
export function deadlineCheck(deadline:number){if(performance.now()>deadline)throw new WorkbookError("Workbook processing exceeded 5 seconds.");}
/** Central-directory sizes are preliminary bounds only. zlib bounds actual allocation
 * during expansion; actual bytes, CRC and local/central agreement are checked too. */
export function expandWorkbook(bytes:Buffer, deadline=performance.now()+LIMITS.milliseconds){
  if(bytes.length>LIMITS.compressed||bytes.length<22||bytes.readUInt32LE(0)!==0x04034b50)throw new WorkbookError("Use an unencrypted .xlsx ZIP no larger than 5 MiB.");
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==bytes.readUInt16LE(end+10)||end+22+bytes.readUInt16LE(end+20)!==bytes.length)throw new WorkbookError("Unsupported ZIP directory or multipart/encrypted workbook.");
  const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
  if(!count||count>LIMITS.entries||offset+size!==end)throw new WorkbookError("Archive entry/directory limit exceeded; ZIP64 is unsupported.");
  const entries:Array<{name:string;start:number;compressed:number;expanded:number;method:number;crc:number}>=[];const names=new Set<string>();let at=offset,total=0;
  for(let i=0;i<count;i++){
    deadlineCheck(deadline);
    if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)throw new WorkbookError("Invalid ZIP entry.");
    const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),checksum=bytes.readUInt32LE(at+16),compressed=bytes.readUInt32LE(at+20),expanded=bytes.readUInt32LE(at+24),len=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),local=bytes.readUInt32LE(at+42);
    if(at+46+len+extra+comment>end||local+30>offset)throw new WorkbookError("Invalid ZIP entry bounds.");
    const name=bytes.subarray(at+46,at+46+len).toString("utf8");at+=46+len+extra+comment;
    if(flags&1||![0,8].includes(method)||name.length>180||name.includes("..")||name.includes("\\")||name.startsWith("/")||names.has(name.toLowerCase()))throw new WorkbookError("Encrypted, duplicate or unsafe archive entry.");
    names.add(name.toLowerCase());total+=expanded;
    if(expanded>LIMITS.entry||total>LIMITS.expanded||compressed>LIMITS.compressed)throw new WorkbookError("Archive expanded-byte limit exceeded.");
    if(!name.endsWith("/")&&!/^(\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(app|core)\.xml|xl\/(workbook\.xml|styles\.xml|sharedStrings\.xml|theme\/theme\d+\.xml|worksheets\/sheet\d+\.xml|(?:_rels\/workbook\.xml|worksheets\/_rels\/sheet\d+\.xml)\.rels))$/.test(name))throw new WorkbookError(`Unsupported workbook part ${name}; macros, connections and embedded files are rejected.`);
    if(bytes.readUInt32LE(local)!==0x04034b50||bytes.readUInt16LE(local+6)!==flags||bytes.readUInt16LE(local+8)!==method)throw new WorkbookError("Local/central ZIP metadata disagree.");
    const n=bytes.readUInt16LE(local+26),x=bytes.readUInt16LE(local+28),start=local+30+n+x;
    if(start+compressed>offset||bytes.subarray(local+30,local+30+n).toString("utf8")!==name)throw new WorkbookError("Invalid local ZIP bounds/name.");
    entries.push({name,start,compressed,expanded,method,crc:checksum});
  }
  if(at!==end)throw new WorkbookError("Invalid archive directory length.");
  const spans=entries.map(e=>[e.start,e.start+e.compressed]).sort((a,b)=>a[0]!-b[0]!);for(let i=1;i<spans.length;i++)if(spans[i]![0]!<spans[i-1]![1]!)throw new WorkbookError("Overlapping ZIP entries.");
  const files=new Map<string,string>();let actual=0;
  for(const e of entries){
    deadlineCheck(deadline);const compressed=bytes.subarray(e.start,e.start+e.compressed);let data:Buffer;
    try{data=e.method===0?compressed:inflateRawSync(compressed,{maxOutputLength:Math.min(LIMITS.entry,LIMITS.expanded-actual)});}catch{throw new WorkbookError("Archive expansion failed or exceeded its actual-byte limit.");}
    actual+=data.length;deadlineCheck(deadline);
    if(actual>LIMITS.expanded||data.length!==e.expanded||crc(data)!==e.crc)throw new WorkbookError("Actual archive size/CRC mismatch.");
    if(!e.name.endsWith("/")){try{files.set(e.name,new TextDecoder("utf-8",{fatal:true}).decode(data));}catch{throw new WorkbookError("Workbook XML must be UTF-8.");}}
  }
  return files;
}
export function xml(text:string, deadline:number, handlers:{open?:(name:string,a:Record<string,string>)=>void;text?:(value:string)=>void;close?:(name:string)=>void}={}){
  const p=new SaxesParser({xmlns:false});let depth=0;
  p.on("doctype",()=>{throw new WorkbookError("DTD/entity declarations are not supported.");});
  p.on("error",()=>{throw new WorkbookError("Malformed workbook XML.");});
  p.on("opentag",t=>{deadlineCheck(deadline);if(++depth>LIMITS.nesting)throw new WorkbookError("XML nesting limit exceeded.");const name=t.name.split(":").at(-1)!;if(name==="f"||name==="definedName"||name==="externalReference"||name==="connection"||(name==="Relationship"&&(t.attributes.TargetMode==="External"||/^(?:[a-z]+:|\/\/)/i.test(String(t.attributes.Target))))||(name==="Override"&&/macroEnabled|vba|binary/i.test(String(t.attributes.ContentType))))throw new WorkbookError("Formulas, macros, external relationships and defined names are unsupported.");handlers.open?.(name,t.attributes as Record<string,string>);});
  p.on("text",v=>handlers.text?.(v));p.on("closetag",t=>{handlers.close?.(t.name.split(":").at(-1)!);depth--;});
  for(let i=0;i<text.length;i+=16384){deadlineCheck(deadline);p.write(text.slice(i,i+16384));}p.close();
}
