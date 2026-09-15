import { notFound } from "next/navigation";

import { DesignLabPreview } from "@/components/design-lab/design-lab-preview";
import {
  DESIGN_DIRECTIONS,
  type DesignDirectionId,
  type DesignScreenId,
} from "@/components/design-lab/mock-data";

const SCREENS = new Set<DesignScreenId>(["login", "operations", "unit", "today"]);

type PageProps = {
  params: Promise<{ direction: string }>;
  searchParams: Promise<{ screen?: string }>;
};

export function generateStaticParams() {
  return DESIGN_DIRECTIONS.map((direction) => ({ direction: direction.id }));
}

export default async function DesignLabDirectionPage({ params, searchParams }: PageProps) {
  const { direction } = await params;
  const { screen: screenParam } = await searchParams;

  if (!DESIGN_DIRECTIONS.some((item) => item.id === direction)) {
    notFound();
  }

  const screen: DesignScreenId =
    screenParam && SCREENS.has(screenParam as DesignScreenId)
      ? (screenParam as DesignScreenId)
      : "operations";

  return <DesignLabPreview direction={direction as DesignDirectionId} screen={screen} />;
}
