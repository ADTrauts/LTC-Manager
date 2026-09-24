import { RepairPriority } from "@prisma/client";

import { createRepairAction } from "@/app/(protected)/repairs/actions";
import { PhotoFileField } from "@/components/photos/photo-file-field";
import { MAX_REPAIR_PHOTOS_PER_SUBMIT } from "@/lib/photo-attachments";

type Option = { id: string; name: string };
type AssetOption = Option & {
  assetCode: string;
  vendor: { name: string } | null;
};

export function RepairCreateForm({
  units,
  assets,
  vendors,
}: {
  units: Option[];
  assets: AssetOption[];
  vendors: Option[];
}) {
  return (
    <form action={createRepairAction} className="grid gap-3 md:grid-cols-2" data-testid="repairs-create-form">
      <label className="block text-sm text-zinc-700">
        Unit
        <select
          name="unitId"
          required
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Select unit</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-zinc-700">
        Asset (optional)
        <select
          name="assetId"
          defaultValue=""
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">No asset linked</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.assetCode} · {asset.name}
              {asset.vendor ? ` · preferred: ${asset.vendor.name}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-zinc-700">
        Actual repair provider
        <select
          name="vendorId"
          defaultValue=""
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Use preferred / none</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-zinc-700">
        Priority
        <select
          name="priority"
          defaultValue={RepairPriority.MEDIUM}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {Object.values(RepairPriority).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-zinc-700 md:col-span-2">
        Work title
        <input
          name="title"
          required
          placeholder="e.g. Compressor service"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm text-zinc-700 md:col-span-2">
        Description
        <textarea
          name="description"
          required
          placeholder="Describe the work needed"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          rows={3}
        />
      </label>
      <div className="md:col-span-2">
        <PhotoFileField
          multiple
          maxCount={MAX_REPAIR_PHOTOS_PER_SUBMIT}
          label="Photos (optional)"
          helper="JPEG, PNG, WebP, or GIF · up to 6 · 8 MB each."
          testId="repair-photo-input"
        />
      </div>
      <div className="flex justify-end border-t border-zinc-200 pt-4 md:col-span-2">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Create repair
        </button>
      </div>
    </form>
  );
}
