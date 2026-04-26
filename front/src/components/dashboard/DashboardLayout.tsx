import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { useLocation } from "@tanstack/react-router";

/**
 * App shell — sidebar + topnav + content.
 *
 * Navigation is exclusively via the sidebar; there is no redundant
 * tab bar. The main area is transparent so the dot-grid background
 * shows through.
 */
export function DashboardLayout({
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const path = location.pathname;

  return (
    <div className="flex min-h-screen text-foreground">
      <Sidebar activePath={path} />
      <div className="flex flex-1 flex-col">
        <TopNav />
        <main className="flex-1 overflow-auto bg-transparent px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
