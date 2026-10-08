import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MarketingLandingPage } from "@/components/marketing/landing-page";
import {
  getAppSession,
  isFacilityScopedSession,
  isOrganizationScopedSession,
} from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { isPublicSignupEnabled } from "@/lib/signup-policy";

export const metadata: Metadata = {
  title: "Vssyl — Your operations. All together.",
  description:
    "See coverage, readiness, logs, and issues for today — from the manager’s board and the tablet on the floor.",
};

export default async function Home() {
  const session = await getAppSession();
  if (session && isOrganizationScopedSession(session)) {
    redirect(`/organization/${session.organizationId}`);
  }
  if (session && isFacilityScopedSession(session)) {
    redirect(
      resolveDefaultHomePath({
        authKind: session.authKind ?? "user",
        role: session.role,
        activeUnitId: session.activeUnitId,
      }),
    );
  }

  return <MarketingLandingPage signupEnabled={isPublicSignupEnabled()} />;
}
