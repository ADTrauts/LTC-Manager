import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getHarborSession } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import {
  decideSupportAttachmentDownload,
  supportAttachmentDownloadHeaders,
} from "@/lib/support/attachments";
import { getSupportAttachmentStore } from "@/lib/support/attachment-store";

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

  if (actor !== "harbor_staff") {
    console.warn("support.attachment.download_denied", { attachmentId, reason: actor });
    return NextResponse.json(
      { error: actor === "anonymous" ? "Unauthorized." : "Forbidden." },
      { status: actor === "anonymous" ? 401 : 403 },
    );
  }

  const attachment = await prisma.supportTicketAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      filename: true,
      contentType: true,
      storageKey: true,
      scanStatus: true,
    },
  });
  const decision = decideSupportAttachmentDownload({
    actor,
    attachment: attachment
      ? { scanStatus: attachment.scanStatus, storageKey: attachment.storageKey }
      : null,
  });

  if (decision.outcome === "not_found") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (decision.outcome !== "ok" || !attachment?.storageKey) {
    console.warn("support.attachment.download_denied", {
      attachmentId,
      reason: decision.outcome,
      scanStatus: attachment?.scanStatus ?? null,
    });
    return NextResponse.json({ error: "Attachment is not available for download." }, { status: 403 });
  }

  const store = getSupportAttachmentStore();
  const bytes = store ? await store.get(attachment.storageKey) : null;
  if (!bytes) {
    return NextResponse.json({ error: "File missing." }, { status: 404 });
  }

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: supportAttachmentDownloadHeaders(attachment.filename, attachment.contentType),
  });
}
