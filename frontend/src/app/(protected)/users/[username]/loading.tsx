function ProfilePostSkeleton({ keyId }: { keyId: string }) {
  return (
    <div
      key={keyId}
      className="ui-surface-input aspect-square animate-pulse rounded-2xl border ui-border"
    />
  );
}

export default function UserProfileLoading() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-2">
      <header className="ui-surface-card rounded-3xl border ui-border p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="ui-surface-input h-24 w-24 animate-pulse rounded-full border ui-border" />
          <div className="flex-1 space-y-3">
            <div className="ui-surface-muted h-7 w-44 animate-pulse rounded" />
            <div className="ui-surface-input h-4 w-32 animate-pulse rounded" />
            <div className="ui-surface-muted h-4 w-64 animate-pulse rounded" />
            <div className="flex gap-2">
              <div className="ui-surface-input h-8 w-24 animate-pulse rounded-full" />
              <div className="ui-surface-input h-8 w-24 animate-pulse rounded-full" />
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {["profile-post-1", "profile-post-2", "profile-post-3"].map((keyId) => (
          <ProfilePostSkeleton key={keyId} keyId={keyId} />
        ))}
      </section>
    </section>
  );
}
