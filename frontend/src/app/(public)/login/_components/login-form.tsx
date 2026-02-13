"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { BrandMarkIcon } from "@/components/ui/icons";

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
      setError("Invalid username or password");
      return;
    }

    router.push("/");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.15),transparent_35%)]" />

      <form
        className="relative z-10 w-full max-w-md space-y-6 rounded-3xl border border-zinc-800/70 bg-zinc-900/75 p-8 shadow-[0_30px_60px_-40px_rgba(14,165,233,0.6)] backdrop-blur"
        onSubmit={handleSubmit}
      >
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-900 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">
            <BrandMarkIcon className="h-3.5 w-3.5 text-sky-400" />
            Mystagram
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Se connecter
          </h1>
          <p className="text-sm text-zinc-400">
            Utilisez vos identifiants mystagram pour continuer.
          </p>
        </header>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-zinc-300"
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
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/75 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Votre identifiant"
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-zinc-300"
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
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/75 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
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
          <p className="text-zinc-400">Mot de passe oublié ?</p>
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Créer un compte
          </button>
        </div>
      </form>
    </main>
  );
}
