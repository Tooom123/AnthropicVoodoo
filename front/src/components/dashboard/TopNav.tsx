import { Calendar, ChevronDown, Sparkles, PanelLeftOpen, DatabaseZap } from "lucide-react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PERIOD_OPTIONS, useGame } from "@/lib/game-context";

// Pages where the period picker has no effect (pre-cached data)
const PERIOD_DISABLED_PATHS = new Set(["/voodoo", "/"]);

interface TopNavProps {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function TopNav({ sidebarOpen = true, onToggleSidebar }: TopNavProps) {
  const { periodLabel, setPeriodByLabel } = useGame();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const periodDisabled = PERIOD_DISABLED_PATHS.has(pathname);

  function launchAnalysis() {
    navigate({ to: "/insights", search: { launch: "1" } as never });
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 gap-3">
      {!sidebarOpen && onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                {periodDisabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="gap-2 border-slate-200 text-slate-400 bg-white cursor-not-allowed opacity-60"
                  >
                    <DatabaseZap className="h-3.5 w-3.5" />
                    <span>Pre-cached</span>
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2 border-slate-200 text-slate-600 bg-white hover:bg-slate-50">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{periodLabel}</span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {PERIOD_OPTIONS.map((r) => (
                        <DropdownMenuItem key={r.label} onClick={() => setPeriodByLabel(r.label)}>
                          {r.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </span>
            </TooltipTrigger>
            {periodDisabled && (
              <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                Cette page affiche un snapshot pré-calculé — le filtre de période ne s'applique pas ici.
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        <Button
          size="sm"
          onClick={launchAnalysis}
          className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Launch new analysis
        </Button>
      </div>
    </header>
  );
}
