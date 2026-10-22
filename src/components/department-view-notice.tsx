export function DepartmentViewNotice({ notice }: { notice: string }) {
  return (
    <p
      className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
      data-testid="department-view-notice"
      role="status"
    >
      {notice}
    </p>
  );
}
