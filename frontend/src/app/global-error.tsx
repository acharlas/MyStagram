"use client";

import Link from "next/link";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const digest = error.digest;

  return (
    <html lang="fr">
      <body className="min-h-screen bg-transparent px-4 py-10 sm:px-6">
        <main
          id="main-content"
          className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center"
        >
          <section className="ui-surface-card w-full rounded-3xl border ui-border p-6 text-center shadow-[0_20px_45px_-35px_rgba(8,112,184,0.55)] sm:p-8">
            <p className="ui-text-subtle text-xs uppercase tracking-[0.18em]">
              Incident inattendu
            </p>
            <h1 className="ui-text-strong mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Une erreur est survenue
            </h1>
            <p className="ui-text-muted mt-3 text-sm leading-relaxed">
              L&apos;application a rencontré un problème critique. Rechargez la
              page ou revenez à l&apos;accueil.
            </p>
            {digest ? (
              <p className="ui-text-subtle mt-2 text-xs">Référence: {digest}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => reset()}
                className="ui-focus-ring ui-accent-button rounded-full px-4 py-2 text-sm font-semibold"
              >
                Réessayer
              </button>
              <Link
                href="/"
                className="ui-focus-ring ui-surface-input ui-text-strong rounded-full border ui-border px-4 py-2 text-sm font-semibold transition hover:border-[color:var(--ui-border-strong)]"
              >
                Retour à l&apos;accueil
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
