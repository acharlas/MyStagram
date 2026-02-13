export default function PostDetailLoading() {
  return (
    <section className="mx-auto flex w-full max-w-6xl animate-pulse flex-col gap-5 py-2 lg:h-[84vh] lg:flex-row lg:gap-4">
      <div className="ui-surface-card overflow-hidden rounded-3xl border ui-border lg:flex-1">
        <div className="ui-surface-input aspect-square w-full lg:h-full" />
      </div>

      <div className="ui-surface-card flex max-h-full flex-col rounded-3xl border ui-border p-4 lg:w-[25rem]">
        <div className="ui-surface-muted mb-4 h-6 rounded" />
        <div className="ui-surface-muted mb-4 h-4 rounded" />
        <div className="flex-1 space-y-3 overflow-hidden pr-1">
          <div className="ui-surface-muted h-4 rounded" />
          <div className="ui-surface-muted h-4 rounded" />
          <div className="ui-surface-muted h-4 rounded" />
        </div>
        <div className="ui-surface-muted mt-4 h-8 rounded" />
      </div>
    </section>
  );
}
