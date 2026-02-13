import { redirect } from "next/navigation";
import { getSessionServer } from "@/lib/auth/session";
import { LoginForm } from "./_components/login-form";

export default async function LoginPage() {
  const session = await getSessionServer();
  if (session?.accessToken && !session.error) {
    redirect("/");
  }

  return <LoginForm />;
}
