import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Activity,
  Target,
  Eye,
  Sparkles,
  Map,
  Wand2,
  Brain,
  TrendingUp,
  Layers,
  Radar,
  GitCompare,
  PieChart,
  Lightbulb,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SubItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}
interface Section {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SubItem[];
}

const SECTIONS: Section[] = [
  {
    label: "Market Intelligence",
    icon: Radar,
    items: [
      { label: "Ad Library", to: "/", icon: LayoutGrid },
      { label: "Performance Signals", to: "/performance", icon: Activity },
      { label: "Competitive Scope", to: "/competitive", icon: Target },
      { label: "HookLens Insights", to: "/insights", icon: Sparkles },
    ],
  },
  {
    label: "Pattern Recognition",
    icon: Eye,
    items: [
      { label: "Trend Detection", to: "/patterns/trends", icon: TrendingUp },
      { label: "Creative Clusters", to: "/patterns/clusters", icon: Layers },
    ],
  },
  {
    label: "Game Mapping",
    icon: Map,
    items: [
      { label: "Genre Map", to: "/mapping/genre", icon: Compass },
      { label: "Audience Overlap", to: "/mapping/overlap", icon: GitCompare },
    ],
  },
  {
    label: "Creative Output",
    icon: Wand2,
    items: [
      { label: "Brief Generator", to: "/creative/brief", icon: Sparkles },
      { label: "Asset Studio", to: "/creative/studio", icon: PieChart },
    ],
  },
  {
    label: "Insight Layer",
    icon: Brain,
    items: [
      { label: "Recommendations", to: "/insights/recommendations", icon: Lightbulb },
    ],
  },
];

export function Sidebar({ activePath }: { activePath: string }) {
  const initialOpen: Record<string, boolean> = {};
  SECTIONS.forEach((s) => {
    initialOpen[s.label] = s.items.some((i) => i.to === activePath) || s.label === "Market Intelligence";
  });
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  return (
    <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div
          className="grid h-8 w-8 place-items-center rounded-md bg-white text-black font-black"
          style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: "1.25rem", lineHeight: 1 }}
          aria-label="Voodoo"
        >
          V
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Voodoo</span>
          <span className="text-[10px] text-muted-foreground">Ad Intelligence</span>
        </div>
      </div>
      <nav className="px-2 py-3 space-y-1">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isOpen = open[section.label];
          return (
            <div key={section.label}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [section.label]: !o[section.label] }))}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  {section.label}
                </span>
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {isOpen && (
                <ul className="mt-1 mb-2 space-y-0.5 pl-2">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.to === activePath;
                    return (
                      <li key={item.label}>
                        <Link
                          to={item.to}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                            isActive
                              ? "bg-primary/15 text-primary font-medium"
                              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
