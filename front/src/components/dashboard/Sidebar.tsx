import { Link } from "@tanstack/react-router";
import {
  LayoutGrid,
  Activity,
  Target,
  Sparkles,
  Compass,
  Gamepad2,
  PanelLeftClose,
  PanelLeftOpen,
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
 * Three sections following the PM's mental model:
 *   Portfolio  — my games + AI insights (core daily workflow)
 *   Intelligence — ad library + competitive landscape
 *   Market     — performance signals + geo spend map
 */
const SECTIONS: Section[] = [
  {
    label: "Portfolio",
    items: [
      { label: "My Games", to: "/voodoo", icon: Gamepad2 },
      { label: "Insights", to: "/insights", icon: Sparkles },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Ad Library", to: "/", icon: LayoutGrid },
      { label: "Competitive Scope", to: "/competitive", icon: Target },
    ],
  },
  {
    label: "Market",
    items: [
      { label: "Performance Signals", to: "/performance", icon: Activity },
      { label: "Global Market Map", to: "/geo", icon: Compass },
    ],
  },
];

interface SidebarProps {
  activePath: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ activePath, collapsed, onToggle }: SidebarProps) {
  const { setGameName } = useGame();

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-slate-200 bg-white flex flex-col transition-all duration-200 ease-in-out overflow-hidden",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Logo + collapse toggle */}
      <div className="flex h-14 items-center border-b border-slate-100 px-3 gap-2">
        <div
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white font-black"
          style={{ background: "#6366f1", fontSize: "1.1rem", lineHeight: 1 }}
          aria-label="Voodoo"
        >
          V
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight flex-1 min-w-0">
            <span className="text-sm font-bold tracking-tight text-slate-800">HookLens</span>
            <span className="text-[10px] text-slate-400">by Voodoo</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-5 overflow-y-auto">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {section.label}
              </p>
            )}
            {collapsed && (
              <div className="mb-1.5 mx-2 h-px bg-slate-100" />
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.to === activePath;
                const isInsightsTab = item.to === "/insights";
                return (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      onClick={() => { if (isInsightsTab) setGameName(""); }}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "bg-indigo-50 text-indigo-600 font-medium"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-indigo-600" : "text-slate-400"
                        )}
                      />
                      {!collapsed && item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom branding */}
      {!collapsed && (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="text-[10px] text-slate-400">© 2026 Voodoo · HookLens</p>
        </div>
      )}
    </aside>
  );
}
