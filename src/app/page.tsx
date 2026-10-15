import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AppShell />;
}
