"use client";

import Link from "next/link";

type ProtectedErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ProtectedError({ error, reset }: ProtectedErrorProps) {
  const digest = error.digest;

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-10">
      <div className="ui-surface-card rounded-2xl border ui-border p-6">
        <p className="ui-text-subtle text-xs uppercase tracking-[0.2em]">Erreur</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">
          Impossible de charger cette page.
        </h1>
        <p className="ui-text-muted mt-2 text-sm">
          Le service est temporairement indisponible. Reessayez dans quelques
          secondes.
        </p>
        {digest ? (
          <p className="ui-text-subtle mt-2 text-xs">Reference: {digest}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            Reessayer
          </button>
          <Link
            href="/"
            className="ui-text-muted inline-flex rounded-full border ui-border px-4 py-2 text-sm font-semibold transition hover:text-zinc-100"
          >
            Retour au fil
          </Link>
        </div>
      </div>
    </section>
  );
}
