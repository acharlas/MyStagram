export default function PostDetailLoading() {
  return (
    <section className="mx-auto flex w-full max-w-6xl animate-pulse flex-col gap-5 py-2 lg:h-[84vh] lg:flex-row lg:gap-4">
      <div className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/70 lg:flex-1">
        <div className="aspect-square w-full bg-zinc-800/80 lg:h-full" />
      </div>

      <div className="flex max-h-full flex-col rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-4 lg:w-[25rem]">
        <div className="mb-4 h-6 rounded bg-zinc-800" />
        <div className="mb-4 h-4 rounded bg-zinc-800" />
        <div className="flex-1 space-y-3 overflow-hidden pr-1">
          <div className="h-4 rounded bg-zinc-800" />
          <div className="h-4 rounded bg-zinc-800" />
          <div className="h-4 rounded bg-zinc-800" />
        </div>
        <div className="mt-4 h-8 rounded bg-zinc-800" />
      </div>
    </section>
  );
}
