/**
 * Outbound Web Push endpoints are browser-supplied URLs.
 * The sender may call only a public HTTPS push service on port 443.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set(["localhost", "metadata", "metadata.google.internal"]);

/** Syntax and literal-address check. Hostnames still need DNS resolution before a real send. */
export function classifyPushEndpointUrl(value: string): "ok" | "unsafe" {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "unsafe";
  }
  if (url.protocol !== "https:") return "unsafe";
  if (url.username || url.password) return "unsafe";
  if (url.port && url.port !== "443") return "unsafe";
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host)) return "unsafe";
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return "unsafe";
  if (isIP(host) && isBlockedAddress(host)) return "unsafe";
  return "ok";
}

/**
 * Resolves the hostname and rejects any private answer.
 * A later DNS change before connect is still possible. Node does not follow HTTP redirects for this request.
 */
export async function resolvePushEndpoint(value: string): Promise<"ok" | "unsafe" | "temporary"> {
  if (classifyPushEndpointUrl(value) !== "ok") return "unsafe";
  const host = new URL(value).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isBlockedAddress(host) ? "unsafe" : "ok";
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0) return "temporary";
    if (records.some((record) => isBlockedAddress(record.address))) return "unsafe";
    return "ok";
  } catch {
    return "temporary";
  }
}

function isBlockedAddress(address: string): boolean {
  const lower = address.toLowerCase();
  const mapped = lower.startsWith("::ffff:") ? lower.slice("::ffff:".length) : lower;
  if (isIP(mapped) === 4) return isBlockedV4(mapped);
  if (isIP(lower) === 6) return isBlockedV6(lower);
  return true;
}

function isBlockedV4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  const c = parts[2] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedV6(address: string): boolean {
  if (address === "::" || address === "::1") return true;
  if (address.startsWith("fc") || address.startsWith("fd")) return true;
  if (address.startsWith("fe8") || address.startsWith("fe9") || address.startsWith("fea") || address.startsWith("feb")) {
    return true;
  }
  if (address.startsWith("ff")) return true;
  if (address.startsWith("2001:db8")) return true;
  return false;
}
