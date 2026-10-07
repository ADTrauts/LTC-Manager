/**
 * Customer Marketplace cover art for Department Products.
 * Paths are static assets under /public/marketing.
 */

const PRODUCT_COVER_BY_KEY: Record<string, string> = {
  HEALTHCARE_FOOD_NUTRITION: "/marketing/hero-servery-morning.png",
  DIETARY: "/marketing/hero-servery-morning.png",
  PLANT: "/marketing/dept-plant-ops.png",
  EVS: "/marketing/dept-evs-cart.png",
};

export function departmentProductCoverSrc(productKey: string): string | null {
  return PRODUCT_COVER_BY_KEY[productKey] ?? null;
}
