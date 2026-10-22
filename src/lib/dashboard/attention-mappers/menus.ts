import type { MenuApplicabilityAttention } from "@/lib/menu-applicability";

import type { DashboardAttentionItem } from "../attention";

export type MenuAttentionFact = {
  menuId: string;
  name: string;
  attention: readonly MenuApplicabilityAttention[];
};

export function attentionFromMenus(input: {
  departmentId: string;
  menus: readonly MenuAttentionFact[];
}): DashboardAttentionItem[] {
  return input.menus
    .filter((menu) => menu.attention.length > 0)
    .map((menu) => {
      const [first, ...rest] = menu.attention;
      return {
        id: `menus:${menu.menuId}`,
        source: "menus",
        severity: "watch",
        departmentId: input.departmentId,
        locationId: null,
        title: menu.name,
        detail: rest.length > 0 ? `${first!.message} (+${rest.length} more)` : first!.message,
        dueAt: null,
        href: `/menus/${menu.menuId}`,
      };
    });
}
