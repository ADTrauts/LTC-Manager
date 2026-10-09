import Link from "next/link";

import type { PartnerAssetDetail } from "@/lib/asset-operations/load-partner-assets";

function value(text: string | null | undefined): string {
  const trimmed = text?.trim();
  return trimmed ? trimmed : "—";
}

function Row({ label, text }: { label: string; text: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-sm text-zinc-900">{value(text)}</dd>
    </div>
  );
}

export function PartnerAssetDetailView({ asset }: { asset: PartnerAssetDetail }) {
  const room = [asset.roomName, asset.roomNumber].filter((part) => part?.trim()).join(" · ");
  return (
    <section className="space-y-6" data-testid="partner-asset-detail">
      <div>
        <Link href="/partner/assets" className="text-sm underline-offset-2 hover:underline">
          Back to Assets
        </Link>
        <h2 className="mt-2 text-lg font-semibold">{asset.name}</h2>
      </div>
      <dl className="grid gap-3">
        <Row label="Asset code" text={asset.assetCode} />
        <Row label="Facility asset number" text={asset.facilityAssetNumber} />
        <Row label="Equipment type" text={asset.equipmentType} />
        <Row label="Status" text={asset.status} />
        <Row label="Criticality" text={asset.criticality} />
        <Row label="Manufacturer" text={asset.manufacturer} />
        <Row label="Model" text={asset.model} />
        <Row label="Serial number" text={asset.serialNumber} />
        <Row label="Unit" text={asset.unitName} />
        {room ? <Row label="Room" text={room} /> : null}
      </dl>
    </section>
  );
}
