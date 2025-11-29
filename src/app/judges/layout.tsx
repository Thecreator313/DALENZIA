import { DashboardLayout } from "@/components/dashboard-layout";

export default function JudgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout panel="judges">
      {children}
    </DashboardLayout>
  );
}
