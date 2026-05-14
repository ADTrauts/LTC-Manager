import { readFile } from "fs/promises";
import { NextResponse } from "next/server";

import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { absoluteUploadPath } from "@/lib/facility-uploads";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session?.facilityId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAtLeastRole(session.role, "MANAGER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: { unionHandbookPdfPath: true, unionHandbookOriginalFilename: true },
  });

  if (!facility?.unionHandbookPdfPath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = await readFile(absoluteUploadPath(facility.unionHandbookPdfPath));
    const name = facility.unionHandbookOriginalFilename ?? "union-handbook.pdf";
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
