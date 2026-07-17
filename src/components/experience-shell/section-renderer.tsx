/**
 * Wave 16A — Section renderer (ordered bands from contracts).
 */

import {
  resolveComponentRenderer,
  type ExperienceShellSection,
} from "@/lib/experience-shell";

import { CardRenderer } from "./card-renderer";
import { UnknownComponentPlaceholder } from "./placeholders";

function sectionLabel(key: string): string {
  return key.replace(/_/g, " ");
}

export function SectionRenderer({
  section,
}: {
  section: ExperienceShellSection;
}) {
  const renderer = resolveComponentRenderer(`section:${section.key}`);
  if (renderer === "UnknownPlaceholder") {
    return <UnknownComponentPlaceholder kind={`section:${section.key}`} />;
  }

  if (section.cards.length === 0 && section.key === "HEADER") {
    return null;
  }

  return (
    <section
      className="space-y-2"
      aria-label={sectionLabel(section.key)}
      data-testid="experience-section"
      data-section-key={section.key}
    >
      {section.key !== "HEADER" ? (
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
          {sectionLabel(section.key)}
        </h4>
      ) : null}
      <div className="space-y-2">
        {section.cards.map((card) => (
          <CardRenderer key={card.key} card={card} />
        ))}
      </div>
    </section>
  );
}
