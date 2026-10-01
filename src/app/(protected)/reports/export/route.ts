import { auditRecordsToCsv } from "@/lib/audit/audit-records";
import { loadAuditOperationalRecords } from "@/lib/audit/load-audit-records";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session?.facilityId) {
    return new Response("Sign in required.", { status: 401 });
  }
  const url = new URL(request.url);
  const departmentId = url.searchParams.get("departmentId")?.trim() ?? "";
  const definition = url.searchParams.get("definition")?.trim() ?? "";
  const from = url.searchParams.get("from")?.trim() ?? "";
  const to = url.searchParams.get("to")?.trim() ?? "";
  if (!departmentId || !definition || !from || !to) {
    return new Response("Choose a department, record, and date range.", { status: 400 });
  }
  const result = await loadAuditOperationalRecords(prisma, {
    facilityId: session.facilityId,
    departmentId,
    fromDateKey: from,
    toDateKey: to,
    catalogStableKey: definition,
    locationFunctionKey: url.searchParams.get("locationFunction"),
  });
  return new Response(auditRecordsToCsv(result.slots), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"audit-records.csv\"",
    },
  });
}
