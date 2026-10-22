/** Extra partner destinations for an accepted vendor head. Kept out of the shell file on purpose. */
export function vendorHeadNavItems(show: boolean): Array<{ href: string; label: string }> {
  if (!show) return [];
  return [
    { href: "/partner/people", label: "People" },
    { href: "/partner/department", label: "Department" },
  ];
}
