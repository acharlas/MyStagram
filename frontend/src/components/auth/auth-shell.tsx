import type { ReactNode } from "react";

import { BrandMarkIcon } from "@/components/ui/icons";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <main
      id="main-content"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(47,156,244,0.2),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(70,168,247,0.12),transparent_35%)]" />

      <section className="ui-surface-card relative z-10 w-full max-w-md space-y-6 rounded-3xl border ui-border p-8 shadow-[0_30px_60px_-40px_rgba(47,156,244,0.55)] backdrop-blur">
        <header className="space-y-2">
          <div className="ui-surface-input ui-text-muted inline-flex items-center gap-2 rounded-full border ui-border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em]">
            <BrandMarkIcon className="h-3.5 w-3.5 text-[color:var(--ui-accent)]" />
            MyStagram
          </div>
          <h1 className="ui-text-strong text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="ui-text-muted text-sm">{subtitle}</p>
        </header>

        {children}
      </section>
    </main>
  );
}
