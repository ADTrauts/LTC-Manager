import { redirect } from "next/navigation";

import { LoginGate } from "@/components/login-gate";
import { getAppSession, isFacilityScopedSession, isOrganizationScopedSession } from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { isPublicSignupEnabled } from "@/lib/signup-policy";

export default async function LoginPage() {
  const session = await getAppSession();
  if (session) {
    if (isOrganizationScopedSession(session)) {
      redirect(`/organization/${session.organizationId}`);
    }
    if (isFacilityScopedSession(session)) {
      redirect(
        resolveDefaultHomePath({
          authKind: session.authKind ?? "user",
          role: session.role,
          activeUnitId: session.activeUnitId,
        }),
      );
    }
    redirect("/login");
  }

  return <LoginGate signupEnabled={isPublicSignupEnabled()} />;
}
