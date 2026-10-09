import type { PartnerAssetListItem } from "@/lib/asset-operations/load-partner-assets";

export function PartnerAssetList({
  departmentName,
  assets,
}: {
  departmentName: string;
  assets: readonly PartnerAssetListItem[];
}) {
  return (
    <section className="space-y-4" data-testid="partner-assets">
      <div>
        <h2 className="text-lg font-semibold">Assets</h2>
        <p className="text-sm text-zinc-600">{departmentName}</p>
      </div>
      {assets.length === 0 ? (
        <p className="text-sm text-zinc-700">No assets are currently assigned to {departmentName}.</p>
      ) : (
        <ul className="space-y-3">
          {assets.map((asset) => (
            <li key={asset.id} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm">
              <p className="font-medium text-zinc-900">{asset.name}</p>
              <p className="text-zinc-600">
                {asset.assetCode}
                {asset.facilityAssetNumber ? ` · ${asset.facilityAssetNumber}` : ""}
                {asset.serialNumber ? ` · ${asset.serialNumber}` : ""}
              </p>
              <p className="text-zinc-600">
                {asset.equipmentType} · {asset.status} · {asset.criticality}
              </p>
              <p className="text-zinc-600">
                {asset.unitName}
                {asset.roomName ? ` · ${asset.roomName}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
