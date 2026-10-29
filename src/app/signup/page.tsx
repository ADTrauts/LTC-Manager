import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import {
  HarborAuthFrame,
  HarborAsideSecondaryLink,
  HARBOR_PRODUCT_POINTS,
} from "@/components/harbor-auth-frame";
import { SignupForm } from "@/components/signup-form";
import { getSession } from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { isPublicSignupEnabled } from "@/lib/signup-policy";

export default async function SignupPage() {
  // This launch flag is runtime configuration. Do not cache a build-time 404
  // before getSession() reaches request-bound cookies.
  await connection();
  if (!isPublicSignupEnabled()) {
    notFound();
  }

  const session = await getSession();
  if (session?.facilityId) {
    redirect(
      resolveDefaultHomePath({
        authKind: session.authKind ?? "user",
        role: session.role,
        activeUnitId: session.activeUnitId,
      }),
    );
  }

  return (
    <HarborAuthFrame
      title="Facility operations, without the noise."
      description="Create your facility. The first step is choosing self setup or Vssyl setup."
      points={HARBOR_PRODUCT_POINTS}
      actions={<HarborAsideSecondaryLink href="/login">Sign in</HarborAsideSecondaryLink>}
    >
      <SignupForm />
    </HarborAuthFrame>
  );
}
