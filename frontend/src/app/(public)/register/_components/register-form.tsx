"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { BrandMarkIcon } from "@/components/ui/icons";
import type { RegisterResult } from "../page";

type RegisterFormProps = {
  action: (formData: FormData) => Promise<RegisterResult>;
};

const isNonEmpty = (value: string) => value.trim().length > 0;

export function RegisterForm({ action }: RegisterFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isNonEmpty(username) || !isNonEmpty(email) || !isNonEmpty(password)) {
      setError("Tous les champs sont requis");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const result = await action(formData);

    if (!result.success) {
      setIsSubmitting(false);
      setError(result.error ?? "Inscription impossible");
      return;
    }

    const loginResult = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (loginResult?.error) {
      setIsSubmitting(false);
      setError("Compte créé, mais connexion échouée");
      router.push("/login");
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
            Créer un compte
          </h1>
          <p className="text-sm text-zinc-400">
            Rejoignez mystagram et commencez à partager dès maintenant.
          </p>
        </header>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-zinc-300"
              htmlFor="username"
            >
              Nom d&apos;utilisateur
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/75 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Votre pseudo"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-zinc-300"
              htmlFor="email"
            >
              Adresse e-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/75 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="vous@example.com"
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
              placeholder="Mot de passe sécurisé"
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
          {isSubmitting ? "Inscription..." : "S'inscrire"}
        </button>

        <button
          type="button"
          onClick={() => router.push("/login")}
          className="w-full rounded-full border border-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          Vous avez déjà un compte ?
        </button>
      </form>
    </main>
  );
}
