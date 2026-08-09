import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";

/**
 * `/operations` is a legacy alias of the retired Operations Center. It redirects to the caller's
 * canonical RUN home (see the retirement note on `/dashboard`). Kept as a registered redirect so
 * existing bookmarks/deep links never dead-end.
 */
export default async function RetiredOperationsAliasPage() {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  redirect(
    resolveDefaultHomePath({
      authKind: session.authKind,
      role: session.role,
      activeUnitId: session.activeUnitId,
    }),
  );
}
