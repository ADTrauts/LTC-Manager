import type { ReactNode } from "react";

import {
  BuildContextBar,
  type BuildContextBarFact,
} from "@/components/build/BuildContextBar";
import { formatBuildCountFact } from "@/lib/build/format-build-count-fact";
import type { FacilityVocabulary } from "@/lib/facility-builder/facility-vocabulary";
import type { FacilityStructureCounts } from "@/lib/facility-builder/summarize-facility-structure-counts";

type FacilityBuilderTab = "structure" | "room-types";

type Props = {
  facilityName: string;
  vocabulary: FacilityVocabulary;
  counts: FacilityStructureCounts;
  activeTab: FacilityBuilderTab;
  roomTypesTabHref: string;
  terminologyFooter: ReactNode;
};

export function FacilityBuildContextBar({
  facilityName,
  vocabulary,
  counts,
  activeTab,
  roomTypesTabHref,
  terminologyFooter,
}: Props) {
  const level0 = vocabulary.level0;
  const level1 = vocabulary.level1;
  const level2 = vocabulary.level2;
  const level3 = vocabulary.level3;

  const facts: BuildContextBarFact[] = [
    ...(counts.buildings > 0
      ? [
          {
            ...formatBuildCountFact(counts.buildings, level0.singular, level0.plural),
          },
        ]
      : []),
    {
      ...formatBuildCountFact(counts.floors, level1.singular, level1.plural),
    },
    {
      ...formatBuildCountFact(counts.neighborhoods, level2.singular, level2.plural),
    },
    {
      ...formatBuildCountFact(counts.rooms, level3.singular, level3.plural),
    },
    {
      ...formatBuildCountFact(counts.roomTypes, "Room Type", "Room Types"),
      href: roomTypesTabHref,
      ariaLabel: `View ${counts.roomTypes} room types`,
      active: activeTab === "room-types",
    },
  ];

  return (
    <BuildContextBar title={facilityName} facts={facts} footer={terminologyFooter} />
  );
}
