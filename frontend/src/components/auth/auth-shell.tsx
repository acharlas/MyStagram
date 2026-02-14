import type { ReactNode } from "react";

import { BrandMarkIcon } from "@/components/ui/icons";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.15),transparent_35%)]" />

      <section className="ui-surface-card relative z-10 w-full max-w-md space-y-6 rounded-3xl border ui-border p-8 shadow-[0_30px_60px_-40px_rgba(14,165,233,0.6)] backdrop-blur">
        <header className="space-y-2">
          <div className="ui-surface-input ui-text-muted inline-flex items-center gap-2 rounded-full border ui-border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em]">
            <BrandMarkIcon className="h-3.5 w-3.5 text-sky-400" />
            MyStagram
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            {title}
          </h1>
          <p className="ui-text-muted text-sm">{subtitle}</p>
        </header>

        {children}
      </section>
    </main>
  );
}
