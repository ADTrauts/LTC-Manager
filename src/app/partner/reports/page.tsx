import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { PartnerReviewDay, PartnerReviewRange } from "@/components/partner/partner-review";
import { loadPartnerOperationalReview } from "@/lib/operational-review/load-partner-operational-review";
import { canPartner } from "@/lib/partner-user-access";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export default async function PartnerReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; start?: string; end?: string }>;
}) {
  noStore();
  const context = await requirePartnerOperationalContext();
  if (!canPartner(context.effectiveRole, "review.read")) redirect("/partner");
  const params = await searchParams;
  const departmentName =
    (
      await prisma.department.findFirst({
        where: {
          id: context.activeDepartmentId,
          facilityId: context.facilityId,
          isActive: true,
        },
        select: { name: true },
      })
    )?.name ?? "Department";

  const review = await loadPartnerOperationalReview({
    client: prisma,
    facilityId: context.facilityId,
    departmentId: context.activeDepartmentId,
    date: params.date,
    start: params.start,
    end: params.end,
  });

  if (review.mode === "range") {
    return (
      <PartnerReviewRange
        departmentName={departmentName}
        presentation={review.presentation}
        validationMessage={review.validationMessage}
        start={review.start}
        end={review.end}
      />
    );
  }

  return <PartnerReviewDay departmentName={departmentName} presentation={review.presentation} />;
}
