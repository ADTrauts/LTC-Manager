import Link from "next/link";

import { ADMIN_HUB_SECTIONS } from "@/lib/administration/admin-hub";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8" data-testid="admin-hub">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Administration</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">
          Facility configuration and system settings. Facility Administrators only.
        </p>
      </header>

      {ADMIN_HUB_SECTIONS.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`admin-section-${section.id}`}
          className="space-y-3"
          data-testid={`admin-hub-section-${section.id}`}
        >
          <h2
            id={`admin-section-${section.id}`}
            className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
          >
            {section.title}
          </h2>
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
            {section.links.map((link) => (
              <li key={link.id}>
                <Link
                  href={link.href}
                  data-testid={`admin-hub-link-${link.id}`}
                  className="flex flex-col gap-0.5 px-4 py-4 transition hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900 sm:px-6"
                >
                  <span className="text-sm font-medium text-zinc-900">{link.label}</span>
                  <span className="max-w-2xl text-sm text-zinc-600">{link.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
