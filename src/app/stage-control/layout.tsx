import { DashboardLayout } from "@/components/dashboard-layout";

export default function StageControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout panel="stage-control">
      {children}
    </DashboardLayout>
  );
}
