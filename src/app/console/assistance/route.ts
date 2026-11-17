import type { NextRequest } from "next/server";
import { AssistanceStructureTooLarge, type AssistanceSpace, type AssistanceUnit } from "@/lib/facility-builder/assistance-structure";
import { AssistanceAuthorityExpired, loadPilotStructure } from "@/lib/harbor-console/assistance-governance";
import { acceptsAssistanceDocument, assistanceNoStore, getAssistancePilot } from "@/lib/harbor-console/assistance-pilot";
import { HARBOR_SESSION_COOKIE, HARBOR_WORK_COOKIE } from "@/lib/harbor-console/session";

export const dynamic = "force-dynamic";

function document(body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Facility structure · Vssyl Console</title><style>
body{font:1rem/1.6 system-ui,sans-serif;color:#182435;background:#f5f7fa;margin:0}main{max-width:52rem;margin:auto;padding:2.5rem 1.5rem}
h1{font-size:1.75rem;line-height:1.2;margin:.5rem 0 1.5rem}a{color:#145278}small{color:#43536a}li{margin:.35rem 0}
ul{padding-left:1.5rem}section{background:white;border:1px solid #dce3ea;padding:1.25rem 1.5rem}
</style><main><a href="/console">Vssyl Console</a>${body}</main></html>`, { status, headers: {
    ...assistanceNoStore, "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  } });
}

function escape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] ?? character));
}

function list(items: string[]) { return items.length ? `<ul>${items.join("")}</ul>` : ""; }
function space(node: AssistanceSpace): string {
  return `<li>${escape(node.name)} <small>${escape(node.type)}</small>${list(node.spaces.map(space))}</li>`;
}
function unit(node: AssistanceUnit): string {
  return `<li>${escape(node.name)} <small>${escape(node.kind)}</small>${list([...node.units.map(unit), ...node.spaces.map(space)])}</li>`;
}
function denied() { return document("<h1>Facility structure unavailable</h1>", 404); }

export async function GET(request: NextRequest) {
  const pilot = getAssistancePilot(request.headers.get("host") ?? request.nextUrl.host);
  const query = request.nextUrl.searchParams;
  if (!pilot || request.cookies.has(HARBOR_WORK_COOKIE) || !acceptsAssistanceDocument(request.headers) ||
      query.getAll("context").length !== 1 || [...query.keys()].some((key) => key !== "context")) return denied();
  try {
    const structure = await loadPilotStructure(pilot, request.cookies.get(HARBOR_SESSION_COOKIE)?.value, query.get("context")!);
    if (!structure) return denied();
    return document(`<h1>Facility structure</h1><section><h2>${escape(structure.facilityName)}</h2>${
      list(structure.units.map(unit)) || "<p>No eligible locations.</p>"
    }</section>`);
  } catch (error) {
    if (error instanceof AssistanceAuthorityExpired) return denied();
    if (error instanceof AssistanceStructureTooLarge) return document("<h1>Facility structure exceeds the view limit</h1>", 409);
    return document("<h1>Facility structure temporarily unavailable</h1>", 503);
  }
}

// Avoid Next's implicit HEAD dispatch to GET and the resulting audit write.
export function HEAD(request: NextRequest) {
  return new Response(null, { status: getAssistancePilot(request.headers.get("host") ?? request.nextUrl.host) ? 405 : 404,
    headers: assistanceNoStore });
}
