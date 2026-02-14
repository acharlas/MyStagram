import Link from "next/link";

export default function UserNotFoundPage() {
  return (
    <section className="ui-surface-card flex h-full flex-col items-center justify-center gap-4 rounded-3xl border ui-border px-6 py-12 text-center backdrop-blur">
      <div className="space-y-2">
        <h1 className="ui-text-strong text-3xl font-semibold">
          Utilisateur introuvable
        </h1>
        <p className="ui-text-muted text-sm">
          Nous n&apos;avons pas pu trouver ce profil. Vérifiez
          l&apos;orthographe ou essayez un autre nom d&apos;utilisateur.
        </p>
      </div>
      <Link
        href="/"
        className="ui-focus-ring ui-accent-button rounded-full px-4 py-2 text-sm font-semibold"
      >
        Revenir au fil
      </Link>
    </section>
  );
}
