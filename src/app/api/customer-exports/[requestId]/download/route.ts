import { getSession } from "@/lib/auth";
import { resolveRequestOrigin } from "@/lib/billing/request-origin";
import { prisma } from "@/lib/prisma";
import { downloadExport, ExportDenied } from "@/lib/customer-record-exports/service";
import { contentDisposition } from "@/lib/compliance-report/report-filename";
export const dynamic = "force-dynamic";
const headers = {
    "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"
};
export async function POST(request: Request, { params }: {
    params: Promise<{
        requestId: string;
    }>;
}) {
    if (request.headers.get("origin") !== await resolveRequestOrigin())
        return new Response("Same-origin download required.", {
            status: 403, headers
        });
    const s = await getSession();
    if (!s)
        return new Response("Sign in required.", {
            status: 401, headers
        });
    const { requestId } = await params;
    try {
        const artifact = await downloadExport(prisma, s, requestId);
        return new Response(new Uint8Array(artifact.bytes), {
            headers: {
                ...headers, "Content-Type": artifact.contentType, "Content-Disposition": contentDisposition(artifact.filename)
            }
        });
    }
    catch (e) {
        return new Response(e instanceof ExportDenied ? e.message : "The export could not be generated. No file was stored; narrow the dates or contact Support.", {
            status: e instanceof ExportDenied ? 403 : 503, headers
        });
    }
}
