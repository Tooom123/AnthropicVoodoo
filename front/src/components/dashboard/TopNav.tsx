import { Calendar, ChevronDown, Moon, Sparkles, Sun } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { PERIOD_OPTIONS, useGame } from "@/lib/game-context";

export function TopNav() {
  const { theme, toggle } = useTheme();
  const { periodLabel, setPeriodByLabel } = useGame();
  const navigate = useNavigate();

  // Always-available "Launch new analysis" CTA in the top-right. Navigates
  // to /insights with ?launch=1 so the Insights page knows to auto-open
  // the LaunchAnalysisModal (zero refactor — we don't need to lift modal
  // state into a global provider, the URL param does the same job).
  function launchAnalysis() {
    navigate({ to: "/insights", search: { launch: "1" } as never });
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold">Voodoo</h1>
        <span className="hidden text-xs text-muted-foreground md:inline">
          / Ad Intelligence — creative trends analysis for Voodoo's publishing team
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={launchAnalysis} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Launch new analysis
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Calendar className="h-3.5 w-3.5" />
              <span>{periodLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PERIOD_OPTIONS.map((r) => (
              <DropdownMenuItem
                key={r.label}
                onClick={() => setPeriodByLabel(r.label)}
              >
                {r.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
