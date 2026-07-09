import { NextResponse } from "next/server";
import { z } from "zod";

import { validateActiveDepartmentPick } from "@/lib/active-department-context";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { getCookieOptions, getSession } from "@/lib/auth";

const bodySchema = z.object({
  departmentId: z.union([z.string().cuid(), z.literal("")]),
});

/** Set operational department scope for nav (HttpOnly cookie). Empty clears — FA sees all tools. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.facilityId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const pick = parsed.data.departmentId;

  if (!(await validateActiveDepartmentPick(session, pick))) {
    return NextResponse.json({ error: "Not allowed for that department." }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  const opts = getCookieOptions();

  if (pick.trim() === "") {
    res.cookies.delete(ACTIVE_DEPARTMENT_COOKIE);
    return res;
  }

  res.cookies.set(ACTIVE_DEPARTMENT_COOKIE, pick.trim(), opts);
  return res;
}
