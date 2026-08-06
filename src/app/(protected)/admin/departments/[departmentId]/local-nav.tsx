import Link from "next/link";

import {
  DEPARTMENT_ADMIN_TABS,
  departmentAdminHref,
  type DepartmentAdminTabId,
} from "@/lib/department-administration";

type Props = {
  departmentId: string;
  activeTab: DepartmentAdminTabId;
  profileId: string | null;
  /** When set, only these tabs render (feature-flag filtered). */
  tabs?: readonly (typeof DEPARTMENT_ADMIN_TABS)[number][];
};

export function DepartmentAdminLocalNav({
  departmentId,
  activeTab,
  profileId,
  tabs = DEPARTMENT_ADMIN_TABS,
}: Props) {
  return (
    <nav
      aria-label="Department Administration"
      className="space-y-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            href={departmentAdminHref(departmentId, tab.id, profileId)}
            className={`block rounded-md px-3 py-2 text-sm transition ${
              active
                ? "bg-zinc-900 font-medium text-white"
                : "text-zinc-700 hover:bg-zinc-50"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <span className="block">{tab.label}</span>
            <span
              className={`mt-0.5 block text-xs ${
                active ? "text-zinc-300" : "text-zinc-500"
              }`}
            >
              {tab.description}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
