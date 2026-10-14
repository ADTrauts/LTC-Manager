import { presentTodaysMenuBlock, type MenuResolutionResult } from "@/lib/menu-runtime";

export function TodaysMenuBlock({ result }: { result: MenuResolutionResult | null }) {
  const view = presentTodaysMenuBlock(result);
  if (!view) return null;

  return (
    <section
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
      data-testid="space-workspace-todays-menu"
    >
      <h2 className="text-base font-semibold text-zinc-900">{view.title}</h2>
      {view.attention ? (
        <p className="mt-2 text-sm text-zinc-600" data-testid="space-workspace-todays-menu-attention">
          {view.attention}
        </p>
      ) : null}
      <div className="mt-3 space-y-4">
        {view.menus.map((menu) => (
          <div key={menu.menuId} data-testid="space-workspace-todays-menu-match">
            {view.menus.length > 1 ? (
              <h3 className="text-sm font-semibold text-zinc-900">{menu.name}</h3>
            ) : menu.periodLabel ? (
              <p className="text-sm font-semibold text-zinc-900">{menu.periodLabel}</p>
            ) : null}
            {menu.incomplete && menu.incompleteLabel ? (
              <p className="mt-1 text-sm text-zinc-600">{menu.incompleteLabel}</p>
            ) : null}
            {menu.categories.length > 0 ? (
              <div className={view.menus.length > 1 || menu.periodLabel ? "mt-2 space-y-2" : "space-y-2"}>
                {menu.categories.map((category) => (
                  <div key={category.name}>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{category.name}</p>
                    <ul className="mt-1 space-y-0.5">
                      {category.items.map((item) => (
                        <li key={item.id} className="text-sm text-zinc-900">
                          {item.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
