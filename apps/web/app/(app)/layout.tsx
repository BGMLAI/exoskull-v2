export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: Add Supabase auth guard here
  return <>{children}</>;
}
