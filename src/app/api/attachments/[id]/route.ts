import { readFile } from "fs/promises";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { absoluteUploadPath } from "@/lib/facility-uploads";
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
  if (!id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await prisma.attachment.findFirst({
    where: { id, facilityId: session.facilityId },
    select: {
      originalFilename: true,
      mimeType: true,
      fileRelativePath: true,
    },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = await readFile(absoluteUploadPath(attachment.fileRelativePath));
    const inline = isDisplayableImageMimeType(attachment.mimeType);
    const filename = attachment.originalFilename || "attachment";
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
