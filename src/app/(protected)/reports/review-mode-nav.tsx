import { SubNav } from "@/components/design-system";

type ReviewModeNavProps = {
  activeId: "review" | "legacy";
  date?: string | null;
  spaceId?: string | null;
};

function reviewHref(date?: string | null, spaceId?: string | null): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (spaceId) params.set("spaceId", spaceId);
  const query = params.toString();
  return query ? `/reports?${query}` : "/reports";
}

function legacyHref(date?: string | null): string {
  const params = new URLSearchParams();
  params.set("view", "legacy");
  if (date) {
    params.set("start", date);
    params.set("end", date);
  }
  return `/reports?${params.toString()}`;
}

export function ReviewModeNav({ activeId, date, spaceId }: ReviewModeNavProps) {
  return (
    <SubNav
      items={[
        { id: "review", label: "Review", href: reviewHref(date, spaceId) },
        { id: "legacy", label: "Legacy Report", href: legacyHref(date) },
      ]}
      activeId={activeId}
      aria-label="Review mode"
      data-testid="review-mode-nav"
    />
  );
}
