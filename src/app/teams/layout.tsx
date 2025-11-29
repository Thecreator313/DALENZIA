import { DashboardLayout } from "@/components/dashboard-layout";

export default function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout panel="teams">
      {children}
    </DashboardLayout>
  );
}
