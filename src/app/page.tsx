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

const title = "Vssyl — Your operations. All together.";
const description =
  "Plan the work for Food & Nutrition and Plant Operations. See today’s coverage, records and maintenance requests in Vssyl.";
const siteUrl = "https://vssyl.com";
const shareImage = {
  url: `${siteUrl}/marketing/share/facility.jpg`,
  width: 1200,
  height: 630,
  alt: "An illustrated cutaway of a care facility, with its kitchen, dining room and plant equipment.",
};

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Vssyl",
    title,
    description,
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [shareImage],
  },
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
