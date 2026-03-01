import { redirect } from "next/navigation";
import { createSupabaseServer } from "../../lib/supabase/server";
import { Sidebar } from "./components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="h-dvh w-full flex overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
