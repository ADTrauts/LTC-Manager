export const HARBOR_CUSTOMER_PAGE_SIZE = 25;

export function harborCustomerPageWindow(total: number, rawPage?: string | string[]) {
  const parsedPage = typeof rawPage === "string" && /^[1-9][0-9]{0,15}$/.test(rawPage) ? Number(rawPage) : 1;
  const requestedPage = Number.isSafeInteger(parsedPage) ? parsedPage : 1;
  const pageCount = Math.max(1, Math.ceil(total / HARBOR_CUSTOMER_PAGE_SIZE));
  // Clamp to the verified result count before constructing a database offset.
  const page = Math.min(requestedPage, pageCount);
  return { page, pageCount, offset: (page - 1) * HARBOR_CUSTOMER_PAGE_SIZE };
}
