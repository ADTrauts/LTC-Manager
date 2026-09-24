import { AssetCriticality } from "@prisma/client";
import Link from "next/link";

import { createAssetAction } from "@/app/(protected)/assets/actions";
import { AssetUnitSpaceFields } from "@/components/asset-operations/asset-unit-space-fields";
import { PhotoFileField } from "@/components/photos/photo-file-field";
import { ASSET_CRITICALITY_OPTIONS } from "@/lib/asset-criticality";
import { MAX_ASSET_PHOTOS } from "@/lib/photo-attachments";

type Option = { id: string; name: string };
type SpaceOption = { id: string; name: string; unitId: string | null };

export function AssetAddForm({
  units,
  spaces,
  departments,
  organizations,
  vendors,
  roomTerm,
  assetOpsEnabled,
}: {
  units: Option[];
  spaces: SpaceOption[];
  departments: Option[];
  organizations: Option[];
  vendors: Option[];
  roomTerm: string;
  assetOpsEnabled: boolean;
}) {
  return (
    <form action={createAssetAction} className="space-y-5" id="asset-builder-add" data-testid="asset-builder">
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-zinc-900">Identity</legend>
        <input
          name="assetCode"
          required
          placeholder="Asset code"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          data-testid="create-asset-code"
        />
        <input
          name="name"
          required
          placeholder="Asset name"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          data-testid="create-asset-name"
        />
        <input
          name="equipmentType"
          required
          placeholder="Equipment type"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          data-testid="create-asset-type"
        />
        <input
          name="manufacturer"
          placeholder="Manufacturer"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <input name="model" placeholder="Model" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <input
          name="serialNumber"
          placeholder="Serial number"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </fieldset>

      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-zinc-900">Location</legend>
        <AssetUnitSpaceFields units={units} spaces={spaces} roomTerm={roomTerm} className="contents" />
      </fieldset>

      <fieldset className="grid gap-3 md:grid-cols-2" data-testid="asset-responsibility-fields">
        <legend className="mb-1 text-sm font-semibold text-zinc-900">Responsibility</legend>
        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Department user</span>
          <select
            name="departmentId"
            defaultValue=""
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            data-testid="create-asset-department"
          >
            <option value="">Defaults from location if possible</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Responsible maintainer</span>
          <select
            name="responsibleOrganizationId"
            defaultValue=""
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            data-testid="create-asset-responsible-org"
          >
            <option value="">Not assigned</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-700 md:col-span-2">
          <span className="font-medium text-zinc-900">Preferred repair vendor</span>
          <select
            name="vendorId"
            defaultValue=""
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            data-testid="create-asset-preferred-provider"
          >
            <option value="">No preferred vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
          {vendors.length === 0 ? (
            <span className="text-xs text-amber-700">
              No repair vendors configured.{" "}
              <Link href="/assets?subtab=vendors" className="underline underline-offset-2">
                Manage vendors
              </Link>
              .
            </span>
          ) : null}
        </label>
      </fieldset>

      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-zinc-900">Importance &amp; lifecycle</legend>
        {assetOpsEnabled ? (
          <label className="flex flex-col gap-1 text-sm text-zinc-700" data-testid="create-asset-lifecycle">
            <span className="font-medium text-zinc-900">Lifecycle</span>
            <select
              name="lifecycle"
              defaultValue="ACTIVE"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              data-testid="create-asset-status"
            >
              <option value="ACTIVE">Active</option>
              <option value="RETIRED">Retired</option>
            </select>
          </label>
        ) : (
          <select
            name="status"
            defaultValue="ACTIVE"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            data-testid="create-asset-status"
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="OUT_OF_SERVICE">OUT_OF_SERVICE</option>
            <option value="RETIRED">RETIRED</option>
          </select>
        )}
        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Operational criticality</span>
          <select
            name="criticality"
            defaultValue={AssetCriticality.ROUTINE}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {ASSET_CRITICALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.description}
              </option>
            ))}
          </select>
        </label>
        <input
          name="notes"
          placeholder="Notes"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-2"
        />
      </fieldset>

      <PhotoFileField
        multiple
        maxCount={MAX_ASSET_PHOTOS}
        label="Photos of the item"
        helper="Optional. A picture of the equipment helps staff recognize it later."
        testId="create-asset-photo"
      />

      <div className="flex justify-end border-t border-zinc-200 pt-4">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          data-testid="create-asset-submit"
        >
          Save asset
        </button>
      </div>
    </form>
  );
}
