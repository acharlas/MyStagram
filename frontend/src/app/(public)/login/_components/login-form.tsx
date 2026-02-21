"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { resolveSafeAuthRedirectTarget } from "@/lib/auth/redirect";

export type CredentialsAuthenticator = typeof signIn;

export async function authenticateCredentials(
  username: string,
  password: string,
  callbackUrl: string,
  authenticator: CredentialsAuthenticator = signIn,
) {
  try {
    const response = await authenticator("credentials", {
      username,
      password,
      redirect: false,
      callbackUrl,
    });

    if (!response || response.error || response.ok !== true) {
      return null;
    }

    if (typeof response.url === "string" && response.url.length > 0) {
      return response.url;
    }

    return callbackUrl;
  } catch {
    return null;
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

    const params = new URLSearchParams(window.location.search);
    const callbackUrl = resolveSafeAuthRedirectTarget(params.get("from"));
    const redirectTo = await authenticateCredentials(
      username,
      password,
      callbackUrl,
    );

    setIsSubmitting(false);

    if (!redirectTo) {
      setError("Identifiants invalides.");
      return;
    }

    window.location.assign(redirectTo);
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
              className="ui-surface-input ui-text-strong w-full rounded-xl border ui-border px-3 py-2.5 text-sm placeholder:text-[color:var(--ui-text-subtle)] focus:border-[color:var(--ui-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ui-focus-ring)]"
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
              className="ui-surface-input ui-text-strong w-full rounded-xl border ui-border px-3 py-2.5 text-sm placeholder:text-[color:var(--ui-text-subtle)] focus:border-[color:var(--ui-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ui-focus-ring)]"
              placeholder="Votre mot de passe"
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        {error ? (
          <p className="ui-error-surface rounded-xl px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="ui-accent-button w-full rounded-full py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Connexion..." : "Se connecter"}
        </button>

        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="ui-text-muted">Mot de passe oublié ?</p>
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="ui-focus-ring ui-surface-input ui-text-strong rounded-full border ui-border px-4 py-2 text-sm font-semibold transition hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-surface-muted)]"
          >
            Créer un compte
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
