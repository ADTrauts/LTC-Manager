/** Extra partner destinations for an accepted vendor head. Kept out of the shell file on purpose. */
export function vendorHeadNavItems(input: {
  people: boolean;
  coverage: boolean;
  rhythm: boolean;
  work: boolean;
  menus: boolean;
}): Array<{ href: string; label: string }> {
  const items: Array<{ href: string; label: string }> = [];
  if (input.people) items.push({ href: "/partner/people", label: "People" });
  if (input.coverage) items.push({ href: "/partner/coverage", label: "People & Coverage" });
  if (input.rhythm) items.push({ href: "/partner/rhythm", label: "Operating Rhythm" });
  if (input.work) items.push({ href: "/partner/work", label: "Work" });
  if (input.menus) items.push({ href: "/partner/menus", label: "Menus" });
  if (input.people || input.coverage) items.push({ href: "/partner/department", label: "Department" });
  return items;
}
