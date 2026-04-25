import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Insights } from "@/components/dashboard/Insights";

export const Route = createFileRoute("/insights")({
  component: InsightsPage,
});

function InsightsPage() {
  return (
    <DashboardLayout title="HookLens Insights">
      <Insights />
    </DashboardLayout>
  );
}
