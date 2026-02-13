import type { ReactNode } from "react";

import { NavBar } from "@/components/ui/navbar";
import { getSessionServer } from "@/lib/auth/session";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSessionServer();
  const username = session?.user?.username ?? "";

  return (
    <div className="min-h-screen bg-transparent text-zinc-100 lg:flex">
      <NavBar username={username} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 sm:px-6 lg:max-w-none lg:px-8 lg:pb-10 lg:pt-8 xl:px-10">
        {children}
      </main>
    </div>
  );
}
