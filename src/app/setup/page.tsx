import { redirect } from "next/navigation";

import { SetupWizard } from "@/components/setup-wizard";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SetupPage() {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: {
      onboardingCompletedAt: true,
    },
  });

  if (!facility) {
    redirect("/login");
  }
  if (facility.onboardingCompletedAt) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <SetupWizard />
    </main>
  );
}
