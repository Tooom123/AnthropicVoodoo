import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AdLibrary } from "@/components/dashboard/AdLibrary";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ad Library — AdIntel Gaming" },
      { name: "description", content: "Browse competitor ad creatives across networks and formats." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <DashboardLayout title="Ad Library">
      <AdLibrary />
    </DashboardLayout>
  );
}
