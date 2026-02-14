"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
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
    <AuthShell
      title="Créer un compte"
      subtitle="Rejoignez MyStagram et commencez à partager dès maintenant."
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              className="ui-text-muted block text-sm font-medium"
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
              className="ui-surface-input ui-text-strong w-full rounded-xl border ui-border px-3 py-2.5 text-sm placeholder:text-[color:var(--ui-text-subtle)] focus:border-[color:var(--ui-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ui-focus-ring)]"
              placeholder="Votre pseudo"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="ui-text-muted block text-sm font-medium"
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
              className="ui-surface-input ui-text-strong w-full rounded-xl border ui-border px-3 py-2.5 text-sm placeholder:text-[color:var(--ui-text-subtle)] focus:border-[color:var(--ui-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ui-focus-ring)]"
              placeholder="vous@example.com"
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
              placeholder="Mot de passe sécurisé"
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
          {isSubmitting ? "Inscription..." : "S'inscrire"}
        </button>

        <button
          type="button"
          onClick={() => router.push("/login")}
          className="ui-focus-ring ui-surface-input ui-text-strong w-full rounded-full border ui-border py-2.5 text-sm font-semibold transition hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-surface-muted)]"
        >
          Vous avez déjà un compte ?
        </button>
      </form>
    </AuthShell>
  );
}
