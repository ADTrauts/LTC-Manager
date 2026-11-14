import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getHarborSession, peekHarborWorkFacilityId } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { supportAttachmentDownloadHeaders } from "@/lib/support/attachments";
import { supportAttachmentDownloadsConfigured } from "@/lib/support/attachment-scanner";
import { readConsoleSupportAttachment } from "@/lib/support/download";

type Props = {
  params: Promise<{ attachmentId: string }>;
};

function actorKind(input: { harborStaff: boolean; facilitySession: boolean }) {
  if (input.harborStaff) return "harbor_staff" as const;
  if (input.facilitySession) return "facility" as const;
  return "anonymous" as const;
}

export async function GET(_request: Request, { params }: Props) {
  const { attachmentId } = await params;
  const [harbor, facility] = await Promise.all([getHarborSession(), getSession()]);
  const actor = actorKind({
    harborStaff: Boolean(harbor),
    facilitySession: Boolean(facility?.facilityId),
  });

  if (!harbor) {
    console.warn("support.attachment.download_denied", { attachmentId, reason: actor });
    return NextResponse.json(
      { error: actor === "anonymous" ? "Unauthorized." : "Forbidden." },
      { status: actor === "anonymous" ? 401 : 403 },
    );
  }

  if (!supportAttachmentDownloadsConfigured()) {
    return NextResponse.json({ error: "Private original downloads are unavailable until the approved scanner is configured." }, { status: 503 });
  }

  const result = await readConsoleSupportAttachment(prisma, {
    kind: "staff",
    session: harbor,
    workFacilityId: await peekHarborWorkFacilityId(),
  }, attachmentId);

  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (result.outcome !== "ok") {
    console.warn("support.attachment.download_denied", { attachmentId, reason: result.outcome });
    return NextResponse.json({ error: "Attachment is not available for download." }, { status: 403 });
  }

  const currentStaff = await getHarborSession();
  if (!currentStaff || currentStaff.uid !== harbor?.uid) return NextResponse.json({ error: "Forbidden." },{ status: 403 });

  const { bytes, filename, contentType } = result.file;
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: supportAttachmentDownloadHeaders(filename, contentType),
  });
}
