import type { PartnerLocationNode } from "@/lib/locations/load-partner-locations";

function LocationBranch({ node }: { node: PartnerLocationNode }) {
  const detail = [node.secondaryLabel, node.physicalType].filter(Boolean).join(" · ");
  return (
    <li>
      <p className={node.presentation === "ACTIONABLE" ? "font-medium text-zinc-900" : "text-zinc-600"}>
        {node.label}
        {detail ? <span className="ml-2 text-xs font-normal text-zinc-500">{detail}</span> : null}
      </p>
      {node.children.length > 0 ? (
        <ul className="mt-1 space-y-1 border-l border-zinc-200 pl-3">
          {node.children.map((child) => (
            <LocationBranch key={child.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PartnerLocations({
  departmentName,
  roots,
}: {
  departmentName: string;
  roots: readonly PartnerLocationNode[];
}) {
  return (
    <section className="space-y-4" data-testid="partner-locations">
      <div>
        <h2 className="text-lg font-semibold">Locations</h2>
        <p className="text-sm text-zinc-600">{departmentName}</p>
      </div>
      {roots.length === 0 ? (
        <p className="text-sm text-zinc-700">No locations are currently assigned to {departmentName}.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {roots.map((node) => (
            <LocationBranch key={node.id} node={node} />
          ))}
        </ul>
      )}
    </section>
  );
}
