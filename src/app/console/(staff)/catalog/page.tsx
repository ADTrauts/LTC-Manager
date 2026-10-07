import { redirect } from "next/navigation";

import { MarketplaceBrowse } from "@/components/harbor-console/marketplace-browse";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import {
  filterMarketplaceItems,
  marketplaceBrowseHref,
  marketplaceBrowseRequestHref,
  resolveMarketplaceBrowse,
  type MarketplaceBrowseParamInput,
} from "@/lib/harbor-console/console-catalog-browse";
import { listConsoleCatalogItems } from "@/lib/harbor-console/console-catalog";
import { prisma } from "@/lib/prisma";

export default async function HarborCatalogPage({
  searchParams,
}: {
  searchParams: Promise<MarketplaceBrowseParamInput>;
}) {
  await requireHarborStaff();
  const params = await searchParams;
  const items = await listConsoleCatalogItems(prisma);
  const query = resolveMarketplaceBrowse(params, items);
  const requested = marketplaceBrowseRequestHref(params);
  const canonical = marketplaceBrowseHref(query);
  if (requested !== canonical) redirect(canonical);

  return <MarketplaceBrowse items={items} rows={filterMarketplaceItems(items, query)} query={query} />;
}
