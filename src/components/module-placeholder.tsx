type ModulePlaceholderProps = {
  title: string;
  description: string;
};

export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">{description}</p>
      </header>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-zinc-600">
          Phase 0 scaffold complete. Full module features ship in upcoming phases.
        </p>
      </div>
    </section>
  );
}
