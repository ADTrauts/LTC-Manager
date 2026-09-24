import type { AppJwtPayload } from "@/lib/auth";
import { validateHarborStaffSession } from "@/lib/harbor-console/auth";
import {
  HARBOR_SESSION_COOKIE,
  HARBOR_WORK_COOKIE,
  verifyHarborSessionToken,
  verifyHarborWorkToken,
  type HarborJwtPayload,
  type HarborWorkJwtPayload,
} from "@/lib/harbor-console/session";
import { composeHarborWorkAppSession } from "@/lib/harbor-console/work-payload";
import { prisma } from "@/lib/prisma";

export { composeHarborWorkAppSession } from "@/lib/harbor-console/work-payload";

export type CookieValueReader = (name: string) => string | undefined;

export type HarborWorkReadResult =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "ok"; harbor: HarborJwtPayload; work: HarborWorkJwtPayload };

export async function readHarborWorkCookies(getCookie: CookieValueReader): Promise<HarborWorkReadResult> {
  const workRaw = getCookie(HARBOR_WORK_COOKIE);
  if (!workRaw) {
    return { status: "absent" };
  }
  const harborRaw = getCookie(HARBOR_SESSION_COOKIE);
  if (!harborRaw) {
    return { status: "invalid" };
  }
  try {
    const [harbor, work] = await Promise.all([
      verifyHarborSessionToken(harborRaw),
      verifyHarborWorkToken(workRaw),
    ]);
    if (work.staffId !== harbor.uid) {
      return { status: "invalid" };
    }
    const authority = await validateHarborStaffSession(harbor);
    if (!authority.valid) {
      return { status: "invalid" };
    }
    return { status: "ok", harbor, work };
  } catch {
    return { status: "invalid" };
  }
}

export async function tryResolveHarborWorkAppSession(
  getCookie: CookieValueReader,
): Promise<AppJwtPayload | null> {
  const read = await readHarborWorkCookies(getCookie);
  if (read.status !== "ok") {
    return null;
  }
  const facility = await prisma.facility.findUnique({
    where: { id: read.work.facilityId },
    select: { id: true },
  });
  if (!facility) {
    return null;
  }
  return composeHarborWorkAppSession(read.harbor, facility.id);
}
