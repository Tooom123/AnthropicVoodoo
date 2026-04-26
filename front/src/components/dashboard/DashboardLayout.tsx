import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { useLocation } from "@tanstack/react-router";

export function DashboardLayout({
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const path = location.pathname;
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-screen text-foreground">
      <Sidebar
        activePath={path}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <TopNav sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 overflow-auto bg-transparent px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
