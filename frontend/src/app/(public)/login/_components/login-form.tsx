"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";

export type CredentialsAuthenticator = typeof signIn;

export async function authenticateCredentials(
  username: string,
  password: string,
  authenticator: CredentialsAuthenticator = signIn,
) {
  try {
    const response = await authenticator("credentials", {
      username,
      password,
      redirect: false,
    });

    return Boolean(response && !response.error);
  } catch {
    return false;
  }
}

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const success = await authenticateCredentials(username, password);

    setIsSubmitting(false);

    if (!success) {
      setError("Identifiants invalides.");
      return;
    }

    router.push("/");
  }

  return (
    <AuthShell
      title="Se connecter"
      subtitle="Utilisez vos identifiants MyStagram pour continuer."
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              className="ui-text-muted block text-sm font-medium"
              htmlFor="username"
            >
              Nom d&apos;utilisateur ou e-mail
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="ui-surface-input w-full rounded-xl border ui-border px-3 py-2.5 text-sm text-zinc-100 placeholder:text-[color:var(--ui-text-subtle)] focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Votre identifiant"
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="ui-text-muted block text-sm font-medium"
              htmlFor="password"
            >
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="ui-surface-input w-full rounded-xl border ui-border px-3 py-2.5 text-sm text-zinc-100 placeholder:text-[color:var(--ui-text-subtle)] focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Votre mot de passe"
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Connexion..." : "Se connecter"}
        </button>

        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="ui-text-muted">Mot de passe oublié ?</p>
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="ui-surface-input rounded-full border ui-border px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-surface-muted)]"
          >
            Créer un compte
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
