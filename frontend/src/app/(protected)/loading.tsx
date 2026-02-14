function FeedCardSkeleton() {
  return (
    <article className="ui-surface-card rounded-3xl border ui-border p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="ui-surface-muted h-10 w-10 animate-pulse rounded-full" />
        <div className="space-y-2">
          <div className="ui-surface-muted h-3 w-28 animate-pulse rounded" />
          <div className="ui-surface-input h-2.5 w-20 animate-pulse rounded" />
        </div>
      </div>
      <div className="ui-surface-input mt-4 aspect-square w-full animate-pulse rounded-2xl" />
      <div className="mt-3 space-y-2">
        <div className="ui-surface-muted h-2.5 w-full animate-pulse rounded" />
        <div className="ui-surface-muted h-2.5 w-3/4 animate-pulse rounded" />
      </div>
    </article>
  );
}

export default function ProtectedLoading() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-6 pt-2">
      <header className="ui-surface-card rounded-2xl border ui-border px-4 py-3">
        <div className="ui-surface-input h-3 w-16 animate-pulse rounded" />
        <div className="ui-surface-muted mt-2 h-5 w-24 animate-pulse rounded" />
      </header>
      {["feed-1", "feed-2"].map((keyId) => (
        <FeedCardSkeleton key={keyId} />
      ))}
    </section>
  );
}
