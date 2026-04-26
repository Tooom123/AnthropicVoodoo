import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Activity,
  Target,
  Sparkles,
  Radar,
  Compass,
  Gamepad2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGame } from "@/lib/game-context";

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

/**
 * Sidebar nav — two sections aligned with the product's mental model:
 *
 *   ▸ HookLens — the core product surface (what the PM does day-to-day):
 *     Ad Library · App Portfolio · HookLens Insights ⭐
 *
 *   ▸ Market Mapping — supporting context views (where do creatives live,
 *     who's competing, where's spend going): Competitive Scope ·
 *     Performance Signals · Global Market Map
 *
 * "App Portfolio" was previously labelled "Voodoo Portfolio" — but
 * once we generalise, any publisher could plug their app catalog in.
 *
 * Old placeholder items (Trend Detection, Creative Clusters, Audience
 * Overlap, Brief Generator, Asset Studio, Recommendations) all pointed
 * to non-existent routes and have been removed.
 */
const SECTIONS: Section[] = [
  {
    label: "Workspace",
    icon: Sparkles,
    items: [
      { label: "Ad Library", to: "/", icon: LayoutGrid },
      { label: "App Portfolio", to: "/voodoo", icon: Gamepad2 },
      { label: "Insights", to: "/insights", icon: Sparkles },
    ],
  },
  {
    label: "Market Mapping",
    icon: Radar,
    items: [
      { label: "Competitive Scope", to: "/competitive", icon: Target },
      { label: "Performance Signals", to: "/performance", icon: Activity },
      { label: "Global Market Map", to: "/geo", icon: Compass },
    ],
  },
];

export function Sidebar({ activePath }: { activePath: string }) {
  const { setGameName } = useGame();
  const initialOpen: Record<string, boolean> = {};
  SECTIONS.forEach((s) => {
    // Open both sections by default — only 6 items total, no need to collapse.
    initialOpen[s.label] = true;
  });
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  return (
    <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        {/*
          Voodoo brand mark: matches voodoo.io's white-V-on-black logo in
          LIGHT mode, and inverts to black-V-on-white in DARK mode so the
          glyph stays visible on either background. font-black + Inter is
          the closest free match to the Voodoo wordmark's heavy stencil.
        */}
        <div
          className="grid h-8 w-8 place-items-center rounded-md bg-black text-white font-black dark:bg-white dark:text-black"
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
                    // The Insights item is special: clicking it should
                    // always land on the LIST view, not the detail view of
                    // whatever game happened to be cached in GameContext.
                    // We clear gameName on click — the Insights component
                    // shows the list whenever no game is selected.
                    const isInsightsTab = item.to === "/insights";
                    return (
                      <li key={item.label}>
                        <Link
                          to={item.to}
                          onClick={() => {
                            if (isInsightsTab) setGameName("");
                          }}
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
