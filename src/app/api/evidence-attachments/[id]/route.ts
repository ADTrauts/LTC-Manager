import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getEvidenceMediaStore } from "@/lib/canonical-logs/evidence-media";
import { isDisplayableImageMimeType } from "@/lib/photo-attachments";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const session = await getSession();
  if (!session?.facilityId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await prisma.operationalEvidenceAttachment.findFirst({
    where: { id, facilityId: session.facilityId },
    select: {
      storageKey: true,
      contentType: true,
      originalFilename: true,
      kind: true,
    },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const store = getEvidenceMediaStore();
  if (!store) {
    return NextResponse.json({ error: "Evidence files are unavailable." }, { status: 503 });
  }
  const bytes = await store.get(attachment.storageKey);
  if (!bytes) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  const inline = attachment.kind !== "FILE" || isDisplayableImageMimeType(attachment.contentType);
  const filename = attachment.originalFilename || "attachment";
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
