import { notFound, redirect } from "next/navigation";

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
      description="Create your facility workspace and start the guided setup flow."
      points={HARBOR_PRODUCT_POINTS}
      actions={<HarborAsideSecondaryLink href="/login">Sign in</HarborAsideSecondaryLink>}
    >
      <SignupForm />
    </HarborAuthFrame>
  );
}
