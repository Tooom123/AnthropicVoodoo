import { Link } from "@tanstack/react-router";
import {
  LayoutGrid,
  Activity,
  Target,
  Sparkles,
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
 */
const SECTIONS: Section[] = [
  {
    label: "Workspace",
    items: [
      { label: "Ad Library", to: "/", icon: LayoutGrid },
      { label: "App Portfolio", to: "/voodoo", icon: Gamepad2 },
      { label: "Insights", to: "/insights", icon: Sparkles },
    ],
  },
  {
    label: "Market Mapping",
    items: [
      { label: "Competitive Scope", to: "/competitive", icon: Target },
      { label: "Performance Signals", to: "/performance", icon: Activity },
      { label: "Global Market Map", to: "/geo", icon: Compass },
    ],
  },
];

export function Sidebar({ activePath }: { activePath: string }) {
  const { setGameName } = useGame();

  return (
    <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
      {/* Logo / brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div
          className="grid h-8 w-8 place-items-center rounded-md text-white font-black"
          style={{
            background: "#6366f1",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: "1.15rem",
            lineHeight: 1,
          }}
          aria-label="Voodoo"
        >
          V
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-tight text-sidebar-foreground">HookLens</span>
          <span className="text-[10px] text-muted-foreground">by Voodoo</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.to === activePath;
                const isInsightsTab = item.to === "/insights";
                return (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      onClick={() => {
                        if (isInsightsTab) setGameName("");
                      }}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-[#6366f1] text-white font-medium shadow-sm"
                          : "text-slate-600 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom branding */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-[10px] text-muted-foreground">
          © 2026 Voodoo · HookLens
        </p>
      </div>
    </aside>
  );
}
