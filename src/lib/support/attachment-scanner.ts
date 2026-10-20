import { request } from "node:https";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
export const SCAN_CODES = ["CLEAN","DETECTED","LIMIT_EXCEEDED","ENCRYPTED","ENCRYPTED_OR_ACTIVE_PDF","MACRO_REJECTED","MACRO_OR_EMBEDDED_CONTENT","ARCHIVE_REJECTED","BLOCKED_CONTENT","UNINSPECTABLE","UNSUPPORTED","UNSUPPORTED_OFFICE_PART","SCANNER_PROTOCOL","SCANNER_FAILURE","ENGINE_UNSUPPORTED","ENGINE_CHANGED","SIGNATURES_STALE","INVALID_REQUEST","INCOMPLETE","TIMEOUT","HASH_MISMATCH","TRANSPORT","OBJECT_UNAVAILABLE","HASH_MISSING","LEASE_EXPIRED"] as const;
export type ScanCode = typeof SCAN_CODES[number];
export type ScanInput = { attachmentId: string; attemptId: string; sha256: string; sizeBytes: number; filename: string; contentType: string; bytes: Uint8Array };
export type ScanResult = { attachmentId: string; attemptId: string; sha256: string; sizeBytes: number; provider: "private-clamav/v1"; verdict: "CLEAN" | "BLOCKED" | "FAILED"; code: ScanCode; inspectedComplete: boolean; scannedAt: string; engineVersion?: string; signatureVersion?: string; signatureUpdatedAt?: string };
export interface SupportAttachmentScanner { scan(input: ScanInput): Promise<ScanResult> }
const resultSchema = z.object({ attachmentId: z.string(), attemptId: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().min(1).max(10*1024*1024), provider: z.literal("private-clamav/v1"), verdict: z.enum(["CLEAN","BLOCKED","FAILED"]), code: z.enum(SCAN_CODES), inspectedComplete: z.boolean(), scannedAt: z.string().datetime({ offset: true }), engineVersion: z.string().max(30).optional(), signatureVersion: z.string().max(30).optional(), signatureUpdatedAt: z.string().datetime({ offset: true }).optional() }).strict();
export function failedScan(input: Pick<ScanInput,"attachmentId"|"attemptId"|"sha256"|"sizeBytes">, code: ScanCode, now = new Date()): ScanResult { return { ...input, provider: "private-clamav/v1", verdict: "FAILED", code, inspectedComplete: false, scannedAt: now.toISOString() }; }
export function validateScanResult(input: Pick<ScanInput,"attachmentId"|"attemptId"|"sha256"|"sizeBytes">, value: unknown, now = new Date()): ScanResult {
  const result = resultSchema.parse(value);
  if (result.attachmentId !== input.attachmentId || result.attemptId !== input.attemptId || result.sha256 !== input.sha256 || result.sizeBytes !== input.sizeBytes || Math.abs(+now-Date.parse(result.scannedAt)) > 5*60*1000) throw new Error("Unbound or stale scan result");
  if (result.verdict === "CLEAN") {
    const version = /^1\.4\.(\d+)$/.exec(result.engineVersion ?? "");
    const signatureAge = +now-Date.parse(result.signatureUpdatedAt ?? "");
    if (!result.inspectedComplete || result.code !== "CLEAN" || !version || Number(version[1]) < 6 || !/^\d+$/.test(result.signatureVersion ?? "") || !Number.isFinite(signatureAge) || signatureAge > 48*3600*1000 || signatureAge < -5*60*1000 || +now >= Date.parse("2027-08-15T00:00:00Z")) throw new Error("Scan is incomplete or engine/signatures are not maintained");
  } else if (result.code === "CLEAN" || result.inspectedComplete) throw new Error("Conflicting scan verdict");
  return result;
}
export function getSupportAttachmentScanner(env: NodeJS.ProcessEnv = process.env): SupportAttachmentScanner | null {
  if (!env.SUPPORT_SCANNER_URL || !env.SUPPORT_SCANNER_BEARER_TOKEN) return null;
  const url = new URL(env.SUPPORT_SCANNER_URL);
  const approved = (env.SUPPORT_SCANNER_ALLOWED_HOSTS ?? "").split(",").map(s => s.trim());
  if (url.protocol !== "https:" || url.pathname !== "/scan" || url.username || url.password || url.search || url.hash || !approved.includes(url.host) || env.SUPPORT_SCANNER_BEARER_TOKEN.length < 32) throw new Error("Private scanner TLS/host/token configuration is invalid");
  return { async scan(input) {
    const response = await new Promise<unknown>((resolve,reject) => {
      const req = request(url,{ method: "POST", rejectUnauthorized: true, minVersion: "TLSv1.2", ca: env.SUPPORT_SCANNER_CA_PEM || undefined, signal: AbortSignal.timeout(55_000), headers: { authorization: `Bearer ${env.SUPPORT_SCANNER_BEARER_TOKEN}`, "content-type": "application/octet-stream", "content-length": input.bytes.byteLength, "x-attachment-id": input.attachmentId, "x-scan-attempt": input.attemptId, "x-content-sha256": input.sha256, "x-filename-base64": Buffer.from(input.filename).toString("base64") } },res => {
        let size = 0; const chunks: Buffer[] = [];
        res.on("data",(chunk: Buffer) => { size += chunk.length; if (size > 10_000) { res.destroy(); reject(new Error("Oversized scanner response")); } else chunks.push(chunk); });
        res.on("error",reject);
        res.on("end",() => { try { if (res.statusCode !== 200) throw new Error("Scanner unavailable"); resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { reject(error); } });
      });
      req.on("error",reject);
      // Raw bytes stream over verified TLS. Never publish or send a Blob URL.
      const chunks = function* () { for (let offset=0;offset<input.bytes.length;offset+=65536) yield input.bytes.subarray(offset,offset+65536); };
      void pipeline(Readable.from(chunks()),req).catch(reject);
    });
    return validateScanResult(input,response);
  } };
}

/** Downloads remain unavailable until the approved private scanner is configured.
 * A historical CLEAN status is not deployment infrastructure approval. */
export function supportAttachmentDownloadsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try { return getSupportAttachmentScanner(env) !== null; } catch { return false; }
}
