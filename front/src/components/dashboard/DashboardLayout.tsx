import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { useLocation } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@tanstack/react-router";

const TABS = [
  { label: "Ad Library", to: "/" },
  { label: "Performance Signals", to: "/performance" },
  { label: "Competitive Scope", to: "/competitive" },
];

export function DashboardLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const path = location.pathname;
  const showTabs = TABS.some((t) => t.to === path);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar activePath={path} />
      <div className="flex flex-1 flex-col">
        <TopNav />
        <main className="flex-1 overflow-auto px-6 py-6">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Market Intelligence
            </p>
            <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">{title}</h2>
          </div>
          {showTabs && (
            <Tabs value={path} className="mb-6">
              <TabsList className="bg-card border border-border">
                {TABS.map((t) => (
                  <TabsTrigger key={t.to} value={t.to} asChild>
                    <Link to={t.to}>{t.label}</Link>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
