import { NextResponse } from "next/server";
import { getHarborSession, peekHarborWorkFacilityId } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { supportAttachmentDownloadsConfigured } from "@/lib/support/attachment-scanner";
import { readImplementationSource } from "@/lib/implementation/service";
import { supportAttachmentDownloadHeaders } from "@/lib/support/attachments";
export async function GET(_request: Request, { params }: { params: Promise<{ engagementId: string; attachmentId: string }> }) {
  try {
    const session = await getHarborSession(); if (!session) return new NextResponse("Unauthorized",{ status: 401 });
    if (!supportAttachmentDownloadsConfigured()) return new NextResponse("Private original downloads require the approved scanner configuration", { status: 503 });
    const { engagementId, attachmentId } = await params;
    const file = await readImplementationSource(prisma,{ kind: "staff", session, workFacilityId: await peekHarborWorkFacilityId() },engagementId,attachmentId);
    return new NextResponse(Buffer.from(file.bytes),{ headers: supportAttachmentDownloadHeaders(file.filename,file.contentType) });
  } catch { return new NextResponse("Source unavailable or quarantined in this Console context",{ status: 403 }); }
}
