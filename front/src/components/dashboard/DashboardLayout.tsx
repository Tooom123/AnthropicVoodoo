import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { useLocation } from "@tanstack/react-router";

/**
 * App shell — sidebar + topnav + page header + content.
 *
 * The previous version also rendered a horizontal tab bar with the
 * Market Intelligence pages (Ad Library / HookLens Insights /
 * Competitive Scope / Performance Signals / Global Market Map). It was
 * a 1:1 duplicate of the sidebar entries, so it's been removed — the
 * sidebar is the single source of truth for top-level navigation.
 */
export function DashboardLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const path = location.pathname;

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
            <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">
              {title}
            </h2>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
