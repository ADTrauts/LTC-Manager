import { resolveRequestOrigin } from "@/lib/billing/request-origin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { prisma } from "@/lib/prisma";
import { LIMITS, requestSchema } from "./contract";
import { PROOF_COOKIE } from "./keys";
import { prepareSpace, recoverSpace, syncSpace, SpaceOfflineError } from "./service";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function spaceRequest(request: Request, body: unknown) {
    const origin = request.headers.get("origin");
    if (origin && origin !== await resolveRequestOrigin())
        return NextResponse.json({ error: "Cross-origin offline request denied." }, { status: 403, headers });
    const session = await getSession();
    if (!session)
        return NextResponse.json({ error: "Authenticate online." }, { status: 401, headers });
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success)
        return NextResponse.json({ error: "Invalid or unsupported Space command." }, { status: 400, headers });
    if (Buffer.byteLength(JSON.stringify(body)) > LIMITS.requestBytes)
        return NextResponse.json({ error: "Request exceeds 192 KiB." }, { status: 413, headers });
    const jar = await cookies(), device = { facilityId: jar.get(DEVICE_FACILITY_COOKIE)?.value || null, unitId: jar.get(DEVICE_UNIT_COOKIE)?.value || null }, proof = jar.get(PROOF_COOKIE)?.value || "";
    try {
        const input = parsed.data;
        if (input.action === "prepare")
            return NextResponse.json(await prepareSpace(prisma, session, input.scope, device), { headers });
        if (input.action === "recover")
            return NextResponse.json(await recoverSpace(prisma, session, input.issuanceId, input.digest, device, proof), { headers });
        return NextResponse.json({ outcomes: await syncSpace(prisma, session, input.commands, device, input.action === "reconcile", input.action === "sync" && input.reviewedExpired, proof) }, { headers });
    }
    catch (e) {
        return NextResponse.json({ error: e instanceof SpaceOfflineError ? e.message : "Offline request could not finish. Reconcile existing intent before retrying." }, { status: e instanceof SpaceOfflineError ? 403 : 503, headers });
    }
}
