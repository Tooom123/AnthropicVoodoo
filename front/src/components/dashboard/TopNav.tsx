import { Calendar, ChevronDown, Sparkles } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PERIOD_OPTIONS, useGame } from "@/lib/game-context";

export function TopNav() {
  const { periodLabel, setPeriodByLabel } = useGame();
  const navigate = useNavigate();

  function launchAnalysis() {
    navigate({ to: "/insights", search: { launch: "1" } as never });
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-white px-6">
      {/* Left: product identity */}
      <div className="flex items-center gap-3">
        <span className="text-base font-bold text-[#6366f1]">HookLens</span>
        <span className="text-xs text-muted-foreground">by Voodoo</span>
      </div>

      {/* Separator */}
      <div className="flex-1" />

      {/* Right: actions */}
      <div className="flex items-center gap-2">
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

        <Button
          size="sm"
          onClick={launchAnalysis}
          className="gap-1.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Launch new analysis
        </Button>
      </div>
    </header>
  );
}
